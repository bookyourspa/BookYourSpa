/** Email delivery: always records to the outbox table, sends via Resend when configured. */
import { newId, nowIso } from './util';

export type Env = {
  DB: D1Database;
  ASSETS?: { fetch(request: Request | string): Promise<Response> };
  APP_ORIGIN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  SEED_TOKEN?: string;
};

const escapeHtml = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function emailLayout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#1c2420;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e6ded0;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#10201a;padding:24px 32px;">
        <div style="font-size:20px;letter-spacing:.28em;color:#c8a96a;text-transform:uppercase;">BookYourSpa</div>
        <div style="color:#e9e3d6;font-size:13px;margin-top:6px;">${escapeHtml(title)}</div>
      </td></tr>
      <tr><td style="padding:32px;font-size:15px;line-height:1.65;">${bodyHtml}</td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #eee5d6;color:#8a8375;font-size:12px;">
        BookYourSpa · 1847 Serenity Row, New York · <a href="${escapeHtml(processEnvOrigin())}" style="color:#a8873f;">bookyourspa.net</a><br/>
        You receive this email because you have an account or booking with us.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

let cachedOrigin = 'https://bookyourspa.net';
export const setEnvOrigin = (o: string) => { if (o) cachedOrigin = o; };
const processEnvOrigin = () => cachedOrigin;

/**
 * Records the email in the outbox (always) and delivers via Resend when RESEND_API_KEY exists.
 * Delivery failures never fail the request — status is recorded for the admin email log.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  bodyHtml: string
): Promise<void> {
  const id = newId('em');
  let provider = 'outbox';
  let status = 'stored';
  try {
    if (env.RESEND_API_KEY) {
      provider = 'resend';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'BookYourSpa <confirmations@bookyourspa.net>',
          to: [to],
          subject,
          html: bodyHtml,
        }),
      });
      status = res.ok ? 'sent' : `failed_${res.status}`;
    }
  } catch (err) {
    status = `failed:${String(err).slice(0, 120)}`;
  }
  try {
    await env.DB.prepare(
      'INSERT INTO emails (id, to_email, subject, body_html, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, to, subject, bodyHtml, provider, status, nowIso()).run();
  } catch {
    // outbox insert must never break the flow
  }
}

export function notify(
  env: Env,
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string
) {
  return env.DB.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).bind(newId('ntf'), userId, type, title, body, link ?? null, nowIso()).run();
}

export const h = escapeHtml;
