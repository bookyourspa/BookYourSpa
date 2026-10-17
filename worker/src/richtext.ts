/**
 * Whitelist rich-text sanitizer.
 *
 * Suppliers write treatment descriptions in a small rich-text editor; the HTML
 * is stored in D1 and rendered on public pages, so it MUST be sanitised on the
 * way in (and again on the way out for defence in depth). Only a fixed set of
 * formatting tags survives, with zero attributes except http(s)/mailto links.
 * Everything else — script/style/iframe blocks including their content, every
 * event handler, every style — is discarded.
 */

const ALLOWED = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'blockquote']);

const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|form|input|button|select|textarea|noscript|template)\b[\s\S]*?<\/\1\s*>/gi;
const DROP_VOID = /<(script|style|iframe|object|embed|svg|math|link|meta|base|input|button|select|textarea|video|audio|source|track)\b[^>]*\/?>/gi;
const TAG = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g;

const safeHref = (raw: string): string | null => {
  // Entities a contenteditable may have produced inside the attribute.
  const url = raw.replace(/&amp;/gi, '&').trim();
  if (/^https?:\/\//i.test(url) && url.length <= 500) return url;
  if (/^mailto:/i.test(url) && url.length <= 320) return url;
  return null;
};

export function sanitizeRichHtml(input: unknown, maxLength = 8000): string {
  let s = String(input ?? '').slice(0, maxLength * 2);

  // Kill dangerous containers wholesale (content included).
  s = s.replace(DROP_WITH_CONTENT, '');
  // Kill any remaining dangerous/void tags.
  s = s.replace(DROP_VOID, '');

  // Walk remaining tags: keep whitelisted ones (normalised), drop the rest —
  // dropping the tag but keeping its inner text, so no content is lost.
  s = s.replace(TAG, (_match, slash: string, rawTag: string, attrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED.has(tag)) return '';
    if (slash) return `</${tag}>`;
    if (tag === 'br') return '<br/>';
    if (tag === 'a') {
      const hrefMatch = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const href = safeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '');
      // Links open safely and never pass referrer or privileges along.
      return href ? `<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">` : '<a>';
    }
    return `<${tag}>`;
  });

  // Any stray '<' left in text nodes that could open an unintended tag.
  // (Built with new RegExp — `${}` interpolation does nothing inside a regex literal.)
  const allowedAlt = [...ALLOWED].join('|');
  s = s.replace(new RegExp(`<(?![/]?(${allowedAlt})([\\s/>]))`, 'gi'), '&lt;');

  // Collapse the empty husks editors leave behind and trim.
  s = s.replace(/<p>(\s|&nbsp;)*<\/p>/gi, '').replace(/&(?:nbsp|#160);/g, ' ');
  return s.trim();
}

/** Plain-text projection of rich HTML — used for the legacy `description` column (search, tables). */
export function richTextToPlain(html: unknown, maxLength = 1000): string {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h3|h4|li|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
