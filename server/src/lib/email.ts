import nodemailer, { Transporter } from "nodemailer";

// Transporter is lazy-initialized so the server can boot even when SMTP
// env vars aren't set yet (e.g. in a dev environment). isEmailEnabled()
// reports whether the worker has everything it needs to actually send.
//
// Note: we intentionally do NOT attach the BERNSTEIN logo as a cid:
// inline image — some webmail preview frames render HTML outside the
// email's multipart/related context and fail with ERR_UNKNOWN_URL_SCHEME.
// The templates render a CSS + emoji brand mark instead, which works
// universally. See shell.ts for the details.

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  // Gmail on 465 needs secure=true; 587 uses STARTTLS (secure=false).
  const secure = port === 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransporter;
}

export function isEmailEnabled(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Stable RFC-2822 Message-ID value (without angle brackets).
  // When set, mail servers and clients that deduplicate by Message-ID
  // (e.g. Gmail) will discard a retry that carries the same ID.
  messageId?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured (missing SMTP_USER / SMTP_PASS).");
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    ...(opts.messageId ? { messageId: opts.messageId } : {}),
  });
}

// Convenience for the server to verify SMTP at startup without sending.
// Returns true on success, false on any error (never throws).
export async function verifySmtp(): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) return false;
  try {
    await transporter.verify();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[email] SMTP verify failed:", msg);
    return false;
  }
}
