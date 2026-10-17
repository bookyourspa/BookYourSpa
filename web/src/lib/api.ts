/** Typed fetch wrapper for the BookYourSpa API (same-origin, CSRF-protected). */

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts;
  const headers: Record<string, string> = { 'x-bys-csrf': '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal,
    });
  } catch {
    throw new ApiError('Network error — check your connection and try again.', 0, 'network');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((data as any)?.error ?? 'Something went wrong. Please try again.', res.status, (data as any)?.code ?? 'error');
  }
  return data as T;
}

/* ---------- shared shapes ---------- */

export type User = {
  id: string; email: string; role: 'admin' | 'supplier' | 'customer';
  name: string; phone: string | null; status: string;
  supplier_id: string | null; supplier_status: string | null;
};

export type Spa = {
  id: string; slug: string; name: string; destination: string; city: string; country: string;
  address: string; summary: string; description: string[]; image: string; gallery: string[];
  facilities: string[]; categories: string[]; priceLevel: number; rating: number;
  reviewCount: number; featured: boolean; lat: number | null; lng: number | null;
  phone?: string; website?: string; mapsUrl?: string;
  spaCategories?: string[]; spaTypes?: string[]; genre?: string; doorstep?: boolean;
  hours: { open: string; close: string; closed: boolean }[]; status: string;
  minPrice: number | null; maxPrice: number | null;
};

export type Booking = {
  code: string;
  spa: { slug: string; name: string; city: string; image: string; address: string };
  itemType: 'treatment' | 'package'; itemSlug: string; itemName: string; durationMin: number;
  date: string; startTime: string; endTime: string;
  amount: number; discount: number; total: number; currency: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rejected';
  paymentStatus: 'unpaid' | 'paid' | 'refunded' | 'failed';
  paymentProvider?: string | null; promoCode?: string | null; notes?: string | null;
  guestName?: string | null; createdAt: string; cancelDeadline: string; canCancel: boolean;
};

export type Slot = { time: string; available: boolean; reason?: string };

export const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gold/15 text-[#8a6d2f]',
  confirmed: 'bg-sage/20 text-moss',
  completed: 'bg-moss/15 text-moss',
  cancelled: 'bg-stone/15 text-stone',
  rejected: 'bg-red-900/10 text-red-900/80',
  unpaid: 'bg-stone/15 text-stone',
  paid: 'bg-sage/20 text-moss',
  refunded: 'bg-gold/15 text-[#8a6d2f]',
  approved: 'bg-sage/20 text-moss',
  new: 'bg-gold/15 text-[#8a6d2f]',
  read: 'bg-stone/15 text-stone',
};
