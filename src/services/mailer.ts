// Mailer service — SMTP delivery with console fallback.
//
// Used by the admin brief approval flow (and any future hub feature that
// needs to send email). Callers pass a fully-formatted message
// (subject, html, text, recipients); this module handles transport.
//
// SMTP config comes from env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//
// If any of those are missing, we DO NOT throw — instead we log the
// message to the console and treat delivery as successful. This keeps
// local dev runnable without SMTP credentials and makes approval flows
// testable end-to-end with a visible audit trail.

import nodemailer, { Transporter } from "nodemailer";

export interface EmailMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
}

let transporterSingleton: Transporter | null = null;

function loadConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
} | null {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !portRaw || !user || !pass || !from) return null;
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port)) return null;
  return { host, port, user, pass, from };
}

function getTransporter(): Transporter | null {
  if (transporterSingleton) return transporterSingleton;
  const cfg = loadConfig();
  if (!cfg) return null;
  transporterSingleton = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  return transporterSingleton;
}

/**
 * Deliver an email. Falls back to console logging when SMTP is unconfigured.
 * Throws on actual delivery failure so callers can halt on error.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const cfg = loadConfig();
  const transporter = getTransporter();

  if (!cfg || !transporter) {
    // Visible, structured fallback so local dev runs can see what would
    // have been sent. Treated as success for flow purposes.
    console.log("---- [mailer] SMTP unconfigured — logging email ----");
    console.log(`To:      ${message.to.join(", ")}`);
    console.log(`Subject: ${message.subject}`);
    console.log("");
    console.log(message.text);
    console.log("---- [mailer] end email ----");
    return;
  }

  try {
    await transporter.sendMail({
      from: cfg.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    console.log(
      `[mailer] delivered "${message.subject}" to ${message.to.length} recipient(s)`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Email delivery failed: ${msg}`);
  }
}

