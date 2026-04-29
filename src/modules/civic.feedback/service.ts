// civic.feedback service — persistence + best-effort operator email.
//
// submitFeedback() writes a row to feedback_submissions and (if
// RESEND_API_KEY is configured) emails the operator. Email failure is
// non-fatal: we still return the persisted row so the user gets a
// confirmation while the operator backfills via DB triage.

import { getDb } from "../../db/client.js";
import { sendEmail } from "../../utils/email.js";
import { generateId } from "../../utils/id.js";
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackSubmission,
  type SubmitFeedbackInput,
} from "./models.js";

const MESSAGE_MAX_LEN = 4000;
const NAME_MAX_LEN = 200;
const EMAIL_MAX_LEN = 320;
const UA_MAX_LEN = 500;

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

function isValidCategory(value: unknown): value is FeedbackCategory {
  return (
    typeof value === "string" &&
    FEEDBACK_CATEGORIES.includes(value as FeedbackCategory)
  );
}

function rowToSubmission(row: Record<string, unknown>): FeedbackSubmission {
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    category: row.category as FeedbackCategory,
    message: String(row.message),
    name: row.name ? String(row.name) : null,
    email: row.email ? String(row.email) : null,
    user_id: row.user_id ? String(row.user_id) : null,
    user_agent: row.user_agent ? String(row.user_agent) : null,
  };
}

export async function submitFeedback(
  input: SubmitFeedbackInput,
): Promise<FeedbackSubmission> {
  if (!isValidCategory(input.category)) {
    throw new FeedbackValidationError(
      `category must be one of: ${FEEDBACK_CATEGORIES.join(", ")}`,
    );
  }
  const message = (input.message ?? "").trim();
  if (!message) {
    throw new FeedbackValidationError("message is required");
  }
  if (message.length > MESSAGE_MAX_LEN) {
    throw new FeedbackValidationError(
      `message must be ${MESSAGE_MAX_LEN} characters or fewer`,
    );
  }

  const name = input.name?.trim() ? input.name.trim().slice(0, NAME_MAX_LEN) : null;
  const email = input.email?.trim()
    ? input.email.trim().toLowerCase().slice(0, EMAIL_MAX_LEN)
    : null;
  const userAgent = input.user_agent?.trim()
    ? input.user_agent.trim().slice(0, UA_MAX_LEN)
    : null;

  const row = {
    id: generateId("fb"),
    category: input.category,
    message,
    name,
    email,
    user_id: input.user_id ?? null,
    user_agent: userAgent,
  };

  const { data, error } = await getDb()
    .from("feedback_submissions")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`feedback: ${error.message}`);
  }
  const submission = rowToSubmission(data);

  // Best-effort operator notification. Never blocks success.
  void notifyOperator(submission).catch((err) => {
    console.warn(
      `[feedback] Operator notification failed for ${submission.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });

  return submission;
}

async function notifyOperator(s: FeedbackSubmission): Promise<void> {
  const recipient =
    process.env.FEEDBACK_RECIPIENT_EMAIL?.trim() || "contact@civic.social";
  const subject = `[Civic Hub feedback] ${s.category} — ${s.message.slice(0, 60)}`;
  const html = renderOperatorEmail(s);
  const result = await sendEmail({ to: recipient, subject, html });
  if (result.sent) {
    console.log(
      `[feedback] Operator notified for ${s.id} (resend id: ${result.id ?? "?"})`,
    );
  } else {
    console.warn(
      `[feedback] Operator email NOT sent for ${s.id}: ${result.error ?? "unknown"}`,
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOperatorEmail(s: FeedbackSubmission): string {
  const messageHtml = escapeHtml(s.message).replace(/\n/g, "<br>");
  const fromLabel =
    s.name && s.email
      ? `${escapeHtml(s.name)} &lt;${escapeHtml(s.email)}&gt;`
      : s.email
        ? escapeHtml(s.email)
        : s.name
          ? escapeHtml(s.name)
          : "Anonymous";
  const userIdLine = s.user_id
    ? `<p style="margin:0;color:#6b7280;font-size:12px;">Signed-in user: <code>${escapeHtml(s.user_id)}</code></p>`
    : "";
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937;">
      <h1 style="font-size:18px;font-weight:600;margin:0 0 12px;">New Civic Hub feedback — ${escapeHtml(s.category)}</h1>
      <p style="margin:0 0 4px;color:#374151;"><strong>From:</strong> ${fromLabel}</p>
      ${userIdLine}
      <p style="margin:12px 0 4px;color:#374151;"><strong>Submitted:</strong> ${escapeHtml(s.created_at)}</p>
      <div style="margin:16px 0 0;padding:14px 18px;background:#f3f4f6;border-radius:8px;line-height:1.5;font-size:14px;">${messageHtml}</div>
      <p style="margin:20px 0 0;color:#6b7280;font-size:12px;">
        Submission id: <code>${escapeHtml(s.id)}</code>
      </p>
    </div>
  `;
}
