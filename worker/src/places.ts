/**
 * Google Maps place import.
 *
 * Suppliers paste a Google Maps place link (the /maps/place/… URL you get from
 * "Share" or from the address bar). From that URL alone we always recover the
 * place name and its exact coordinates. To also recover phone, website and the
 * full street address we follow the same two-step dance the Maps web app does:
 * the place page embeds a /maps/preview/place?pb=… endpoint whose response
 * carries the structured detail (phone, website, address, category, rating).
 * All parsing is regex-based over the raw payload — no API key required — and
 * every field is best-effort: whatever we can't find is simply left null so the
 * supplier can fill it in by hand.
 */
import { ApiError } from './util';

export type PlaceDetails = {
  name: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
  /** Fields we could not recover — the UI nudges the supplier to complete them. */
  missing: string[];
};

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY = 2_500_000; // Maps place pages are ~200 KB; hard cap well above that

const GOOGLE_HOST = /^([a-z]{2,3}\.)?google\.[a-z]{2,}(\.[a-z]{2,})?$/i;

/** Accepts google.com/maps/place/…, country domains (google.co.id), and maps.google.* */
export function isMapsPlaceUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname;
  const isGoogle = GOOGLE_HOST.test(host) || /^maps\.google\./i.test(host);
  if (!isGoogle) return false;
  return u.pathname.includes('/maps/place/') || u.pathname.startsWith('/maps/search/');
}

/** Name + coordinates are encoded directly in the place URL — no network needed. */
function parseUrlFallbacks(url: string): Partial<PlaceDetails> {
  const out: Partial<PlaceDetails> = {};
  // /maps/place/<Name>/@-8.72,115.18,17z/…
  const m = /\/maps\/place\/([^/@]+)/.exec(url);
  if (m) {
    try { out.name = decodeURIComponent(m[1]).replace(/\+/g, ' ').trim(); } catch { out.name = m[1].replace(/\+/g, ' '); }
  }
  // !3d<lat>!4d<lng> is the exact pin; @lat,lng,z is the viewport centre.
  const data = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
  if (data) { out.lat = Number(data[1]); out.lng = Number(data[2]); }
  else {
    const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
    if (at) { out.lat = Number(at[1]); out.lng = Number(at[2]); }
  }
  return out;
}

const fetchText = async (url: string, referer?: string): Promise<{ ok: boolean; body: string; finalUrl: string }> => {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      'user-agent': UA,
      'accept-language': 'en-US,en;q=0.9',
      ...(referer ? { referer } : {}),
    },
  });
  if (!res.ok) return { ok: false, body: '', finalUrl: res.url };
  const body = (await res.text()).slice(0, MAX_BODY);
  return { ok: true, body, finalUrl: res.url };
};

/** Pulls phone / website / address / category / rating out of the preview payload. */
function parseDetailPayload(text: string, name?: string | null): Partial<PlaceDetails> {
  const out: Partial<PlaceDetails> = {};

  // Phone: appears as ["+62 818-0467-7778"] next to a call icon.
  const phone = /"(\+[0-9][0-9 .()\u2013-]{7,22})"/.exec(text);
  if (phone) out.phone = phone[1].trim();

  // Website: duplicated as ["https://site.example/","site.example",…] — first
  // entry is the full URL. Skip Google-owned and image-CDN hosts.
  const sites = text.match(/"(https?:\/\/[^"]{4,200})","([a-z0-9.-]+\.[a-z]{2,}[^"]*)"/gi) ?? [];
  for (const s of sites) {
    const url = /"(https?:\/\/[^"]+)"/.exec(s)?.[1] ?? '';
    if (!url || /google|gstatic|ggpht|googleusercontent|schema\.org|trvl-media|cupid\.travel|booking|expedia|airbnb/i.test(url)) continue;
    out.website = url;
    break;
  }

  // Address: "<Name>, <full street address>" appears right after the name in the
  // payload; the part after the name is the address line we want.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let address = '';
  if (name) {
    const own = new RegExp(`"${esc(name)}, ([^\"]{5,160})"`).exec(text);
    if (own) address = own[1].trim();
  }
  if (!address) {
    const lines = (text.match(/"[^"]*(?:Jl\.|Jalan |Street|Rd\.|Road|Avenue|Lane|Blvd|Weg|Rue|Via |Str\.)[^"\n]*\d[^"\n]*"/g) ?? [])
      .map((l) => l.slice(1, -1));
    if (lines.length) {
      address = lines.reduce((a, b) => (b.length > a.length ? b : a));
      address = name
        ? address.replace(new RegExp(`^${esc(name)}, `), '')
        : address.replace(/^[^,]+, /, '');
      address = address.trim();
    }
  }
  if (address) out.address = address;

  // Category + location line: ["Spa"],"Pemogan, Denpasar Selatan"
  const cat = /null,\["([A-Z][A-Za-z &]{2,40})"\],"([^"]{3,80})"/.exec(text);
  if (cat) out.category = cat[1].trim();

  // Rating + review count: …,"9,000 reviews"…,null,null,null,4.8,9000]
  const rating = /,null,null,null,(\d\.\d),(\d[\d,]*)\]/.exec(text);
  if (rating) {
    out.rating = Number(rating[1]);
    out.reviewCount = Number(rating[2].replace(/,/g, ''));
  }

  // Editorial description, when Google has one.
  const editorial = /"editorial_summary":\s*\[\s*"((?:[^"\\]|\\.){20,400})"/.exec(text)
    ?? /\["([A-Z][^"]{40,300})"\],\[\d/.exec(text);
  if (editorial) {
    try { (out as any).editorial = editorial[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&'); } catch { /* best effort */ }
  }

  return out;
}

export async function importGooglePlace(rawUrl: string): Promise<PlaceDetails> {
  const url = String(rawUrl ?? '').trim();
  if (!isMapsPlaceUrl(url)) {
    throw new ApiError(400, 'Paste a Google Maps place link — the /maps/place/… URL from “Share” or your address bar', 'invalid_maps_url');
  }

  const details: PlaceDetails = {
    ...parseUrlFallbacks(url),
    address: null, phone: null, website: null, category: null, rating: null, reviewCount: null,
    mapsUrl: url.split('#')[0],
    missing: [],
  } as PlaceDetails;

  try {
    // Step 1: the place page HTML embeds the preview endpoint that carries details.
    const page = await fetchText(url);
    const previewPath = /href="(\/maps\/preview\/place\?[^"]+)"/.exec(page.body)?.[1]
      ?? /"(\/maps\/preview\/place\?[^"]+)"/.exec(page.body)?.[1];

    if (page.ok && previewPath) {
      // Step 2: fetch that endpoint — its payload has the structured details.
      const previewUrl = 'https://www.google.com' + previewPath.replace(/&amp;/g, '&');
      const payload = await fetchText(previewUrl, page.finalUrl);
      if (payload.ok) Object.assign(details, parseDetailPayload(payload.body, details.name));
    }
    if (page.ok && !details.name) {
      const t = /<title>([^<]{2,90})<\/title>/.exec(page.body)?.[1]?.trim();
      if (t && !/^Google Maps/.test(t)) details.name = t;
    }
  } catch {
    // Network hiccup or consent wall — the URL fallbacks above still stand.
  }

  // Coerce + sanity-bound everything we recovered.
  if (details.name) details.name = details.name.slice(0, 120);
  if (details.address) details.address = details.address.slice(0, 200);
  if (details.phone) details.phone = details.phone.slice(0, 40);
  if (details.website && !/^https?:\/\//i.test(details.website)) details.website = null;
  if (details.website) details.website = details.website.slice(0, 300);
  if (details.lat != null && (!Number.isFinite(details.lat) || Math.abs(details.lat) > 90)) details.lat = null;
  if (details.lng != null && (!Number.isFinite(details.lng) || Math.abs(details.lng) > 180)) details.lng = null;
  if (details.rating != null && (details.rating < 0 || details.rating > 5)) details.rating = null;

  details.missing = (['name', 'phone', 'website', 'address'] as const).filter((k) => !details[k]);
  return details;
}
