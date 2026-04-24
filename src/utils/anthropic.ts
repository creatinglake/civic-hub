// Tiny Anthropic client — posts to the Messages API.
// No SDK dependency; keeps the deployable surface small (same philosophy
// as utils/email.ts for Resend).
//
// Exposes a single function: `callClaude`. Accepts a user text prompt and
// optionally a base64-encoded PDF document block. Returns the assistant's
// text output, the model name the API reported, and a basic usage dump.
//
// Env vars:
//   ANTHROPIC_API_KEY  — required. Starts with `sk-ant-…`.
//   ANTHROPIC_MODEL    — optional; default defined in DEFAULT_MODEL.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Pinned default model. Operators can override via ANTHROPIC_MODEL.
 * Current as of 2026-04 (Slice 6 build). Sonnet-tier balances cost and
 * quality for multi-document summarization.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-5-20251022";

export interface CallClaudeInput {
  model: string;
  system?: string;
  userText: string;
  /** Base64-encoded document for PDF input (native document block). */
  documentBase64?: { data: string; mediaType: string; filename?: string };
  /** Upper bound on generated tokens. */
  maxTokens?: number;
}

export interface CallClaudeResult {
  text: string;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

interface AnthropicContent {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  id?: string;
  model: string;
  content: AnthropicContent[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type: string; message: string };
}

/**
 * One in-function retry on transient failure (HTTP 5xx or network error),
 * then give up. Matches the slice's scope note: no complex backoff.
 */
export async function callClaude(
  input: CallClaudeInput,
): Promise<CallClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  try {
    return await callClaudeOnce(apiKey, input);
  } catch (err) {
    if (!isTransient(err)) throw err;
    await sleep(2000);
    return callClaudeOnce(apiKey, input);
  }
}

async function callClaudeOnce(
  apiKey: string,
  input: CallClaudeInput,
): Promise<CallClaudeResult> {
  const userContent: unknown[] = [];
  if (input.documentBase64) {
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: input.documentBase64.mediaType,
        data: input.documentBase64.data,
      },
      ...(input.documentBase64.filename
        ? { title: input.documentBase64.filename }
        : {}),
    });
  }
  userContent.push({ type: "text", text: input.userText });

  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: input.maxTokens ?? 4096,
    messages: [{ role: "user", content: userContent }],
  };
  if (input.system) body.system = input.system;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    const isServer = res.status >= 500 && res.status < 600;
    const err = new Error(
      `Anthropic API ${res.status}: ${errText.slice(0, 300)}`,
    );
    (err as Error & { transient?: boolean }).transient = isServer;
    throw err;
  }

  const data = (await res.json()) as AnthropicResponse;
  if (data.error) {
    throw new Error(
      `Anthropic error: ${data.error.type} ${data.error.message}`,
    );
  }

  const text = (data.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");

  return {
    text,
    model: data.model ?? input.model,
    usage: data.usage,
  };
}

function isTransient(err: unknown): boolean {
  if (err instanceof Error) {
    if ((err as Error & { transient?: boolean }).transient === true) return true;
    // Common network / fetch transient errors.
    if (/fetch failed|network|ECONN|ETIMEDOUT|aborted/i.test(err.message)) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
