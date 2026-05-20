import {
  callClaudeMultiTurn,
  DEFAULT_MODEL,
  type MultiTurnMessage,
} from "../../utils/anthropic.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import type {
  CallAssistantInput,
  AssistantResponse,
  Suggestion,
  DraftProposal,
} from "./models.js";

export type CallClaudeMultiTurnFn = typeof callClaudeMultiTurn;

export async function callAssistant(
  input: CallAssistantInput,
  claude: CallClaudeMultiTurnFn = callClaudeMultiTurn,
): Promise<AssistantResponse> {
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  const systemPrompt = buildSystemPrompt(
    input.hub_config,
    input.category,
    input.draft_state,
    input.phase,
  );

  const messages: MultiTurnMessage[] = [
    ...input.conversation_history,
    { role: "user", content: input.user_message },
  ];

  const tools = [
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 3,
    },
  ];

  const result = await claude({ model, system: systemPrompt, messages, tools });

  return parseAssistantResponse(result.text);
}

function parseAssistantResponse(text: string): AssistantResponse {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      message: text,
      suggestions: [],
      draft_proposal: null,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    const message: string = typeof parsed.message === "string"
      ? parsed.message
      : text;

    const suggestions: Suggestion[] = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s: unknown) => s && typeof s === "object")
          .map((s: Record<string, unknown>) => ({
            severity: s.severity === "hard" ? "hard" : "soft",
            quoted_text: typeof s.quoted_text === "string" ? s.quoted_text : null,
            field: isValidField(s.field) ? s.field : null,
            message: typeof s.message === "string" ? s.message : "",
            suggested_revision: typeof s.suggested_revision === "string"
              ? s.suggested_revision
              : null,
          }))
      : [];

    const draft_proposal: DraftProposal | null = parsed.draft_proposal &&
      typeof parsed.draft_proposal === "object"
      ? {
          title: String(parsed.draft_proposal.title ?? ""),
          description: String(parsed.draft_proposal.description ?? ""),
          sources: String(parsed.draft_proposal.sources ?? ""),
          considerations: String(parsed.draft_proposal.considerations ?? ""),
        }
      : null;

    return { message, suggestions, draft_proposal };
  } catch {
    return {
      message: text,
      suggestions: [],
      draft_proposal: null,
    };
  }
}

const VALID_FIELDS = new Set(["title", "description", "sources", "considerations"]);
function isValidField(v: unknown): v is "title" | "description" | "sources" | "considerations" {
  return typeof v === "string" && VALID_FIELDS.has(v);
}
