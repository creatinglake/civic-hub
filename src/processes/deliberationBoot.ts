import { createPolisDeliberationHandler } from "../shared/polis_deliberation/handler.js";
import { createPolisAdapter } from "../shared/polis_deliberation/adapter/polisAdapter.js";
import { createPolisSummarizer } from "../shared/polis_deliberation/summarization/polisSummarizer.js";
import { emitEvent } from "../events/eventEmitter.js";
import { generateId } from "../utils/id.js";
import { callClaude, DEFAULT_MODEL } from "../utils/anthropic.js";
import type { ProcessHandler } from "./types.js";
import type { PolisHostInterface } from "../shared/polis_deliberation/hostInterface.js";
import type { PolisAdapter } from "../shared/polis_deliberation/adapter/types.js";

const HUB_ID = "civic-hub-local";
const DEFAULT_JURISDICTION = "local";

let _adapter: PolisAdapter | null = null;

export function getPolisAdapter(): PolisAdapter {
  if (!_adapter) throw new Error("Deliberation boot not called yet");
  return _adapter;
}

export function bootDeliberation(): ProcessHandler {
  const polisBaseUrl = process.env.POLIS_BASE_URL || "https://polis.civic.social";
  const polisAuthToken = process.env.POLIS_AUTH_TOKEN || "";

  if (!polisAuthToken) {
    console.log(
      "[deliberation] POLIS_AUTH_TOKEN not set — deliberation handler will fail on Polis API calls",
    );
  }

  _adapter = createPolisAdapter({
    baseUrl: polisBaseUrl,
    authToken: polisAuthToken,
  });

  const llmClient = {
    async complete(params: {
      system: string;
      user: string;
      maxTokens: number;
    }): Promise<string> {
      const result = await callClaude({
        model: DEFAULT_MODEL,
        system: params.system,
        userText: params.user,
        maxTokens: params.maxTokens,
      });
      return result.text;
    },
  };

  const summarize = createPolisSummarizer({
    llmClient,
    polisBaseUrl,
  });

  const host: PolisHostInterface = {
    async emitEvent(input) {
      await emitEvent({
        event_type: input.event_type,
        actor: input.actor,
        process_id: "",
        hub_id: HUB_ID,
        jurisdiction: input.jurisdiction || DEFAULT_JURISDICTION,
        data: input.data,
      });
    },
    generateId(prefix) {
      return generateId(prefix || "id");
    },
    async writeOutcomeDelivery(_slug, _payload) {
      const id = generateId("outcome");
      return { id, delivery_timestamp: new Date().toISOString() };
    },
    async getResponseById(_responseId) {
      return null;
    },
  };

  const shared = createPolisDeliberationHandler({
    adapter: _adapter,
    summarize,
    host,
    polisBaseUrl,
  });

  return shared as unknown as ProcessHandler;
}
