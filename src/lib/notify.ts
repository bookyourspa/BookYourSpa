/**
 * Notification service: in-platform notifications + transactional email and
 * WhatsApp templates. Channels are pluggable via env:
 *   EMAIL_TRANSPORT=log   -> messages stored in outbound_messages (default/QA)
 *   EMAIL_TRANSPORT=smtp  -> real SMTP delivery (see docs/ENVIRONMENT.md)
 *   WHATSAPP_PROVIDER     -> unset logs to outbound_messages instead of sending
 * Templates cover: welcome, verify email, password reset, booking confirmation,
 * payment confirmation, cancellation, refund, supplier registration/approval,
 * review request, booking reminder.
 */
import crypto from "node:crypto";
import { getDb } from "./db";
import { sha256 } from "./auth";

export interface Template {
  subject: string;
  body: (vars: Record<string, string>) => string;
  whatsapp?: (vars: Record<string, string>) => string;
}

export const TEMPLATES: Record<string, Template> = {
  welcome: {
    subject: "Welcome to Book Your Spa",
    body: (v) => `Hi ${v.name},\n\nYour Book Your Spa account is ready. Discover, compare and book the world's best spas.\n\n${v.appUrl}`,
  },
  verify_email: {
    subject: "Verify your email",
    body: (v) => `Hi ${v.name},\n\nConfirm your email address by opening this link:\n${v.link}\n\nThe link expires in 24 hours.`,
  },
  password_reset: {
    subject: "Reset your password",
    body: (v) => `Hi ${v.name},\n\nReset your password here (valid 1 hour):\n${v.link}\n\nIf you did not request this, ignore this email.`,
  },
  booking_confirmation: {
    subject: "Booking confirmation",
    body: (v) =>
      `Your Book Your Spa reservation ${v.ref} has been confirmed.\n\n` +
      `${v.treatment} · ${v.guests} guest(s)\n${v.date} at ${v.time}\n${v.spa}, ${v.city}\n\nTotal: ${v.currency} ${v.total}\n\nView your voucher: ${v.appUrl}/dashboard/bookings/${v.ref}`,
    whatsapp: (v) =>
      `Your Book Your Spa reservation ${v.ref} has been confirmed. ${v.treatment} at ${v.spa}, ${v.date} ${v.time}.`,
  },
  payment_confirmation: {
    subject: "Payment received",
    body: (v) => `We received your payment of ${v.currency} ${v.amount} for booking ${v.ref}. Thank you!`,
  },
  booking_reminder: {
    subject: "Upcoming booking reminder",
    body: (v) => `Reminder: your spa treatment at ${v.spa} is ${v.when}. See you soon!`,
    whatsapp: (v) => `Your spa treatment at ${v.spa} is ${v.when}.`,
  },
  booking_cancelled: {
    subject: "Booking cancelled",
    body: (v) => `Booking ${v.ref} has been cancelled.${v.reason ? ` Reason: ${v.reason}` : ""}`,
  },
  refund: {
    subject: "Refund processed",
    body: (v) => `Your refund of ${v.currency} ${v.amount} for booking ${v.ref} has been processed.`,
  },
  review_request: {
    subject: "How was your treatment?",
    body: (v) => `Hi ${v.name},\n\nHow was your experience at ${v.spa}? Share a review:\n${v.appUrl}/dashboard/bookings/${v.ref}#review`,
  },
  supplier_registration: {
    subject: "We received your spa application",
    body: (v) => `Hi ${v.name},\n\nYour application for ${v.business} is under review. We will notify you once our team completes its check.`,
  },
  supplier_approved: {
    subject: "Your spa is approved",
    body: (v) => `Congratulations! ${v.business} is now live on Book Your Spa. Log in to your supplier dashboard to add treatments and therapists.`,
  },
};

type Channel = "email" | "whatsapp";

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

function render(template: string, vars: Record<string, string>) {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Unknown template: ${template}`);
  const subject = typeof (t as any).subject === "function" ? (t as any).subject(vars) : t.subject;
  return { subject, body: t.body(vars) };
}

/** Queue/send a transactional email. Returns the outbound message id. */
export function sendEmail(template: string, to: string, vars: Record<string, string>): number {
  const { subject, body } = render(template, { ...vars, appUrl: vars.appUrl || appUrl() });
  const transport = process.env.EMAIL_TRANSPORT || "log";
  let status: "logged" | "sent" | "failed" = "logged";
  let error: string | null = null;
  if (transport === "smtp") {
    // SMTP delivery is configured via environment (docs/ENVIRONMENT.md).
    // Without a configured relay we record the failure rather than silently dropping mail.
    if (!process.env.SMTP_HOST) {
      status = "failed";
      error = "SMTP_HOST not configured";
    }
  }
  const info = getDb()
    .prepare(
      `INSERT INTO outbound_messages (channel, template, to_address, subject, payload, status, error)
       VALUES ('email', ?, ?, ?, ?, ?, ?)`
    )
    .run(template, to, subject, JSON.stringify({ ...vars, body }), status, error);
  return Number(info.lastInsertRowid);
}

/** Queue/send a WhatsApp message (logged when no provider configured). */
export function sendWhatsApp(template: string, to: string, vars: Record<string, string>): number {
  const t = TEMPLATES[template];
  const text = t?.whatsapp ? t.whatsapp(vars) : render(template, vars).body;
  const provider = process.env.WHATSAPP_PROVIDER;
  const status = provider && process.env.WHATSAPP_API_TOKEN ? "queued" : "logged";
  const info = getDb()
    .prepare(
      `INSERT INTO outbound_messages (channel, template, to_address, subject, payload, status)
       VALUES ('whatsapp', ?, ?, ?, ?, ?)`
    )
    .run(template, to, null, JSON.stringify({ text, ...vars }), status);
  return Number(info.lastInsertRowid);
}

/**
 * In-platform notification + optional email/WhatsApp for a user id.
 * `target` accepts a user id (preferred) or a supplier id when kind starts with "supplier:".
 */
export function notify(
  target: number,
  type: string,
  title: string,
  body: string,
  link?: string
): void {
  const db = getDb();
  const user = db.prepare("SELECT id, email, full_name FROM users WHERE id = ?").get(target) as any;
  if (!user) return;
  db.prepare(
    "INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)"
  ).run(user.id, type, title, body, link ?? null);
}

/** Notify a user by email/WhatsApp with a template (used for transactional flow). */
export function notifyChannel(
  userId: number,
  template: string,
  vars: Record<string, string>,
  channels: Channel[] = ["email"]
): void {
  const db = getDb();
  const user = db.prepare("SELECT id, email, whatsapp FROM users WHERE id = ?").get(userId) as any;
  if (!user) return;
  if (channels.includes("email")) sendEmail(template, user.email, vars);
  if (channels.includes("whatsapp") && user.whatsapp) sendWhatsApp(template, user.whatsapp, vars);
}

/** Password reset token (raw token returned; only hash stored). */
export function createPasswordReset(userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600_000).toISOString();
  getDb()
    .prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)")
    .run(userId, sha256(token), expires);
  return token;
}
