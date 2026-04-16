// Tiny email client — posts to Resend's HTTP API.
// No SDK dependency — keeps the deployable surface small.
//
// Env vars:
//   RESEND_API_KEY   — secret key from resend.com. If unset, email is
//                       NOT sent (caller should log a fallback).
//   RESEND_FROM      — the "From" header, e.g.
//                       "Floyd Civic Hub <noreply@floyd.civic.social>"
//                       Defaults to the Resend sandbox if unset.

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider?: "resend";
  id?: string;
  error?: string;
}

/**
 * Send an email via Resend. Returns { sent: false } if RESEND_API_KEY is
 * unset — caller can decide to fall back (e.g. log to console in dev).
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: "RESEND_API_KEY is not configured" };
  }

  const from =
    process.env.RESEND_FROM ?? "Civic Hub <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? stripHtml(input.html),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        sent: false,
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = (await res.json()) as { id?: string };
    return { sent: true, provider: "resend", id: data.id };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Minimal HTML-to-text for the plaintext fallback. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .trim();
}
