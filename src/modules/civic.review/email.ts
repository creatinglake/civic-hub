import { sendEmail } from "../../utils/email.js";
import { uiBaseUrl } from "../../utils/baseUrl.js";

/**
 * Send via Resend (the same path used by the digest and OTP sign-in) and
 * surface failures loudly. The review module previously used the SMTP
 * mailer, whose env vars aren't set in prod — so every review email
 * silently fell back to console logging and never reached anyone.
 */
async function send(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const result = await sendEmail(input);
  if (!result.sent) {
    console.error(
      `[review/email] Failed to send "${input.subject}" to ${input.to}: ${result.error}`,
    );
  }
}

function processTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    "civic.vote": "Vote",
    "civic.proposal": "Proposal",
    "civic.polis_deliberation": "Conversation",
    "civic.project": "Project",
  };
  return labels[type] || "Process";
}

export async function notifyCreatorSubmitted(input: {
  creator_email: string;
  creator_name: string;
  process_type: string;
  title: string;
  review_id: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);
  const ui = uiBaseUrl();
  const url = `${ui}/my-submissions/${input.review_id}`;

  await send({
    to: input.creator_email,
    subject: `Your ${typeLabel} "${input.title}" is in review`,
    html: `
      <p>Hi ${input.creator_name},</p>
      <p>Your ${typeLabel} <strong>"${input.title}"</strong> has been submitted and is now in review.</p>
      <p>The hub admin will review it shortly. You'll be notified when there's an update.</p>
      <p><a href="${url}">View your submission status</a></p>
    `,
    text: `Hi ${input.creator_name},\n\nYour ${typeLabel} "${input.title}" has been submitted and is now in review.\n\nThe hub admin will review it shortly. You'll be notified when there's an update.\n\nView your submission: ${url}`,
  });
}

export async function notifyAdminNewSubmission(input: {
  admin_email: string;
  creator_name: string;
  process_type: string;
  title: string;
  review_id: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);
  const ui = uiBaseUrl();
  const url = `${ui}/admin/reviews/${input.review_id}`;

  await send({
    to: input.admin_email,
    subject: `New ${typeLabel} "${input.title}" submitted for review by ${input.creator_name}`,
    html: `
      <p>${input.creator_name} submitted a new ${typeLabel} for review:</p>
      <p><strong>"${input.title}"</strong></p>
      <p><a href="${url}">Review it now</a></p>
    `,
    text: `${input.creator_name} submitted a new ${typeLabel} for review:\n\n"${input.title}"\n\nReview it: ${url}`,
  });
}

export async function notifyCreatorChangesRequested(input: {
  creator_email: string;
  creator_name: string;
  process_type: string;
  title: string;
  review_id: string;
  note: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);
  const ui = uiBaseUrl();
  const url = `${ui}/my-submissions/${input.review_id}`;

  await send({
    to: input.creator_email,
    subject: `Changes requested on your ${typeLabel} "${input.title}"`,
    html: `
      <p>Hi ${input.creator_name},</p>
      <p>The admin has requested changes on your ${typeLabel} <strong>"${input.title}"</strong>:</p>
      <blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">${input.note}</blockquote>
      <p><a href="${url}">View and revise your submission</a></p>
    `,
    text: `Hi ${input.creator_name},\n\nThe admin has requested changes on your ${typeLabel} "${input.title}":\n\n"${input.note}"\n\nView and revise: ${url}`,
  });
}

export async function notifyCreatorApproved(input: {
  creator_email: string;
  creator_name: string;
  process_type: string;
  title: string;
  process_id: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);
  const ui = uiBaseUrl();

  const pathMap: Record<string, string> = {
    "civic.vote": "/process",
    "civic.proposal": "/proposal",
    "civic.polis_deliberation": "/deliberation",
    "civic.project": "/project",
  };
  const basePath = pathMap[input.process_type] || "/process";
  const url = `${ui}${basePath}/${input.process_id}`;

  await send({
    to: input.creator_email,
    subject: `Your ${typeLabel} "${input.title}" is now live!`,
    html: `
      <p>Hi ${input.creator_name},</p>
      <p>Your ${typeLabel} <strong>"${input.title}"</strong> has been approved and is now live on the hub.</p>
      <p><a href="${url}">View your ${typeLabel}</a></p>
    `,
    text: `Hi ${input.creator_name},\n\nYour ${typeLabel} "${input.title}" has been approved and is now live on the hub.\n\nView it: ${url}`,
  });
}

export async function notifyCreatorDeclined(input: {
  creator_email: string;
  creator_name: string;
  process_type: string;
  title: string;
  reason: string;
  review_id: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);
  const ui = uiBaseUrl();
  const url = `${ui}/my-submissions/${input.review_id}`;

  await send({
    to: input.creator_email,
    subject: `Your ${typeLabel} "${input.title}" was not approved`,
    html: `
      <p>Hi ${input.creator_name},</p>
      <p>Your ${typeLabel} <strong>"${input.title}"</strong> was not approved for the following reason:</p>
      <blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">${input.reason}</blockquote>
      <p><a href="${url}">View details</a></p>
    `,
    text: `Hi ${input.creator_name},\n\nYour ${typeLabel} "${input.title}" was not approved.\n\nReason: ${input.reason}\n\nView details: ${url}`,
  });
}

export async function notifyAdminResubmitted(input: {
  admin_email: string;
  creator_name: string;
  process_type: string;
  title: string;
  review_id: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);
  const ui = uiBaseUrl();
  const url = `${ui}/admin/reviews/${input.review_id}`;

  await send({
    to: input.admin_email,
    subject: `${input.creator_name} revised their ${typeLabel} "${input.title}"`,
    html: `
      <p>${input.creator_name} has revised and resubmitted their ${typeLabel}:</p>
      <p><strong>"${input.title}"</strong></p>
      <p><a href="${url}">Review it now</a></p>
    `,
    text: `${input.creator_name} has revised and resubmitted their ${typeLabel}:\n\n"${input.title}"\n\nReview it: ${url}`,
  });
}

export async function notifyAdminWithdrawn(input: {
  admin_email: string;
  creator_name: string;
  process_type: string;
  title: string;
}): Promise<void> {
  const typeLabel = processTypeLabel(input.process_type);

  await send({
    to: input.admin_email,
    subject: `${input.creator_name} withdrew their ${typeLabel} "${input.title}"`,
    html: `
      <p>${input.creator_name} has withdrawn their ${typeLabel}:</p>
      <p><strong>"${input.title}"</strong></p>
      <p>No action needed — it has been removed from the review queue.</p>
    `,
    text: `${input.creator_name} has withdrawn their ${typeLabel}:\n\n"${input.title}"\n\nNo action needed — it has been removed from the review queue.`,
  });
}
