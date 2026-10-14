/** Payments: Stripe Checkout when configured, secure demo gateway otherwise. */
import { ApiError, money, newId, nowIso, randomToken } from './util';
import { sendEmail, emailLayout, h, notify, type Env } from './email';

export type BookingForPayment = {
  id: string; code: string; customer_id: string; spa_id: string;
  item_name: string; total: number; currency: string; commission: number;
  booking_date: string; start_time: string;
};

export const luhnValid = (cardNumber: string) => {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
};

export async function markBookingPaid(
  env: Env,
  booking: BookingForPayment,
  provider: 'stripe' | 'demo',
  ref: string
) {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE bookings SET payment_status = 'paid', status = 'pending', payment_provider = ?, payment_ref = ?, updated_at = ? WHERE id = ? AND payment_status = 'unpaid'"
    ).bind(provider, ref, nowIso(), booking.id),
    env.DB.prepare(
      'INSERT INTO payments (id, booking_id, provider, amount, currency, commission, status, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(newId('pay'), booking.id, provider, booking.total, booking.currency, booking.commission, 'succeeded', ref, nowIso()),
  ]);

  const spa = await env.DB.prepare('SELECT name, city FROM spas WHERE id = ?').bind(booking.spa_id).first<{ name: string; city: string }>();
  const customer = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?').bind(booking.customer_id).first<{ email: string; name: string }>();

  await notify(env, booking.customer_id, 'payment', 'Payment received',
    `Your payment of ${booking.currency === 'USD' ? '$' : ''}${booking.total} for ${booking.item_name} was successful. The spa has been notified.`,
    '/login');
  if (customer && spa) {
    await sendEmail(env, customer.email, `Payment confirmed — booking ${booking.code}`,
      emailLayout('Payment confirmed', `
        <p>Hello ${h(customer.name)},</p>
        <p>Thank you — your payment for <strong>${h(booking.item_name)}</strong> at <strong>${h(spa.name)}</strong> has been received.</p>
        <p><strong>Booking code:</strong> ${h(booking.code)}<br/>
        <strong>When:</strong> ${h(booking.booking_date)} at ${h(booking.start_time)}<br/>
        <strong>Amount paid:</strong> ${h(booking.currency)} ${h(String(booking.total))}</p>
        <p>The spa will confirm your appointment shortly — you will receive another email the moment it is confirmed.</p>
        <p style="margin-top:24px;"><a href="${h(processOrigin())}/login" style="background:#10201a;color:#c8a96a;padding:12px 22px;border-radius:6px;text-decoration:none;">View your booking</a></p>`));
  }
  const supplier = await env.DB.prepare(
    'SELECT s.user_id FROM spas sp JOIN suppliers s ON s.id = sp.supplier_id WHERE sp.id = ?'
  ).bind(booking.spa_id).first<{ user_id: string }>();
  if (supplier) {
    await notify(env, supplier.user_id, 'booking', 'New paid booking request',
      `${booking.item_name} · ${booking.booking_date} ${booking.start_time} · code ${booking.code}`, '/supplier');
  }
}

let origin = 'https://bookyourspa.net';
export const setPaymentOrigin = (o: string) => { if (o) origin = o; };
const processOrigin = () => origin;

/** Demo gateway: validates card shape, never stores card data. */
export async function demoPayment(env: Env, booking: BookingForPayment, cardNumber: string) {
  if (!luhnValid(cardNumber)) {
    throw new ApiError(402, 'Card number failed validation. Use test card 4242 4242 4242 4242.', 'card_declined');
  }
  const ref = `demo_${randomToken(16)}`;
  await markBookingPaid(env, booking, 'demo', ref);
  return { provider: 'demo', reference: ref, paid: true };
}

/** Stripe Checkout Session — payment fields never touch our servers. */
export async function stripeCheckout(env: Env, booking: BookingForPayment) {
  if (!env.STRIPE_SECRET_KEY) throw new ApiError(503, 'Payments are not configured', 'payments_unavailable');
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${processOrigin()}/login?booking=${booking.code}&payment=success`);
  params.set('cancel_url', `${processOrigin()}/login?booking=${booking.code}&payment=cancelled`);
  params.set('metadata[bookingCode]', booking.code);
  params.set('client_reference_id', booking.code);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', booking.currency.toLowerCase());
  params.set('line_items[0][price_data][unit_amount]', String(Math.round(booking.total * 100)));
  params.set('line_items[0][price_data][product_data][name]', `${booking.item_name} — booking ${booking.code}`);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    throw new ApiError(502, `Stripe error: ${data.error?.message ?? 'unable to create checkout session'}`, 'stripe_error');
  }
  return { provider: 'stripe', checkoutUrl: data.url };
}

export async function verifyStripeSignature(payload: string, sigHeader: string, secret: string) {
  const parts: Record<string, string[]> = {};
  for (const chunk of sigHeader.split(',')) {
    const [k, v] = chunk.split('=');
    (parts[k] ??= []).push(v ?? '');
  }
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

export async function handleStripeWebhook(env: Env, payload: string, sigHeader: string) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new ApiError(503, 'Webhooks not configured', 'webhook_unavailable');
  if (!(await verifyStripeSignature(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET))) {
    throw new ApiError(400, 'Invalid Stripe signature', 'bad_signature');
  }
  const event = JSON.parse(payload) as { type: string; data?: { object?: { metadata?: { bookingCode?: string }; payment_status?: string } } };
  if (event.type === 'checkout.session.completed') {
    const code = event.data?.object?.metadata?.bookingCode;
    if (code) {
      const booking = await env.DB.prepare('SELECT id, code, customer_id, spa_id, item_name, total, currency, commission, booking_date, start_time FROM bookings WHERE code = ?')
        .bind(code).first<BookingForPayment>();
      if (booking && booking.code === code) {
        await markBookingPaid(env, booking, 'stripe', `pi_${randomToken(12)}`);
      }
    }
  }
  return { received: true };
}
