import type { PolisAdapter } from "./adapter/types.js";
import type { PolisHostInterface } from "./hostInterface.js";
import type {
  DeliberationSummary,
  PolisDeliberationInput,
  PolisDeliberationState,
} from "./types.js";

export const PROCESS_TYPE = "civic.polis_deliberation";

export interface ProcessHandlerShape {
  type: string;
  initializeState(input: Record<string, unknown>): Record<string, unknown>;
  handleAction(
    process: { id: string; status: string; state: Record<string, unknown>; spaceSlug?: string; jurisdiction?: string; createdBy?: string },
    action: { type: string; actor: string; payload: Record<string, unknown> },
  ): Promise<Record<string, unknown>>;
  getReadModel(
    process: { id: string; status: string; state: Record<string, unknown> },
    actor?: string,
  ): Record<string, unknown>;
  getSummary(
    process: { id: string; status: string; state: Record<string, unknown>; title?: string },
  ): Record<string, unknown>;
}

export interface PolisHandlerDeps {
  adapter: PolisAdapter;
  summarize: (
    conversationId: string,
    adapter: PolisAdapter,
    topic: string,
  ) => Promise<DeliberationSummary>;
  host: PolisHostInterface;
  polisBaseUrl: string;
}

export function createPolisDeliberationHandler(
  deps: PolisHandlerDeps,
): ProcessHandlerShape {
  const { adapter, summarize, host, polisBaseUrl } = deps;

  const handler: ProcessHandlerShape = {
    type: PROCESS_TYPE,

    initializeState(input: Record<string, unknown>): Record<string, unknown> {
      const cfg = input as unknown as PolisDeliberationInput;
      const state: PolisDeliberationState = {
        polis_conversation_id: "",
        polis_base_url: "",
        topic: cfg.topic,
        framing: cfg.framing,
        deadline: cfg.deadline ?? null,
        participation_threshold: cfg.participation_threshold ?? null,
        last_math_tick: 0,
        summary: null,
        summary_status: "pending",
        continued_from_response_id: cfg.continued_from_response_id ?? null,
      };
      return state as unknown as Record<string, unknown>;
    },

    async handleAction(process, action) {
      const state = process.state as unknown as PolisDeliberationState;

      switch (action.type) {
        case "start": {
          const input = state;
          const { conversation_id } = await adapter.createDeliberation({
            topic: input.topic,
            description: input.framing,
            strict_moderation:
              (process.state as any).polis_moderation === "strict",
            seed_statements: (process.state as any).seed_statements,
          });

          state.polis_conversation_id = conversation_id;
          state.polis_base_url = `${polisBaseUrl}/${conversation_id}`;
          process.status = "active";

          await host.emitEvent({
            event_type: "civic.process.started",
            actor: action.actor,
            space_slug: process.spaceSlug ?? "",
            jurisdiction: process.jurisdiction ?? "",
            data: {
              process_id: process.id,
              process_type: PROCESS_TYPE,
              polis_conversation_id: conversation_id,
              topic: input.topic,
            },
          });

          return { polis_conversation_id: conversation_id };
        }

        case "close": {
          await adapter.closeDeliberation(state.polis_conversation_id);
          process.status = "closed";

          state.summary_status = "generating";
          try {
            state.summary = await summarize(
              state.polis_conversation_id,
              adapter,
              state.topic,
            );
            state.summary_status = "complete";
          } catch (err) {
            state.summary_status = "failed";
            console.error("[polis-handler] Summarization failed:", err);
          }

          await host.emitEvent({
            event_type: "civic.process.ended",
            actor: action.actor,
            space_slug: process.spaceSlug ?? "",
            jurisdiction: process.jurisdiction ?? "",
            data: {
              process_id: process.id,
              process_type: PROCESS_TYPE,
              summary_status: state.summary_status,
              participation_stats:
                state.summary?.participation_stats ?? null,
            },
          });

          if (state.summary && state.summary_status === "complete") {
            const slug = process.spaceSlug ?? "";
            const outcome = await host.writeOutcomeDelivery(slug, {
              originating_process_id: process.id,
              originating_process_type: PROCESS_TYPE,
              outcome_summary: state.summary.summary_text,
              participation_stats: {
                total_participants:
                  state.summary.participation_stats.total_participants,
              },
              result: {
                directed_questions: state.summary.directed_questions,
                top_consensus_statements:
                  state.summary.top_consensus_statements,
                opinion_groups: state.summary.opinion_groups,
                linked_polis_data_uri: state.summary.linked_polis_data_uri,
                methodology: state.summary.methodology,
              },
            });

            await host.emitEvent({
              event_type: "civic.outcome_delivered",
              actor: "system",
              space_slug: slug,
              jurisdiction: process.jurisdiction ?? "",
              data: {
                outcome_id: outcome.id,
                originating_process_id: process.id,
                originating_process_type: PROCESS_TYPE,
              },
            });

            process.status = "finalized";
          }

          return {
            summary_status: state.summary_status,
            summary: state.summary,
          };
        }

        case "poll_state": {
          const clusterState = await adapter.pullClusterState(
            state.polis_conversation_id,
          );
          state.last_math_tick = clusterState.math_tick;

          if (
            state.participation_threshold &&
            clusterState.participant_count >= state.participation_threshold
          ) {
            return handler.handleAction(process, {
              ...action,
              type: "close",
            });
          }

          if (state.deadline) {
            const deadlineTime = new Date(state.deadline).getTime();
            // Guard Invalid Date: NaN comparisons are silently false, which
            // would leave a past-deadline conversation open indefinitely.
            if (Number.isFinite(deadlineTime) && Date.now() >= deadlineTime) {
              return handler.handleAction(process, {
                ...action,
                type: "close",
              });
            }
          }

          return {
            math_tick: clusterState.math_tick,
            participant_count: clusterState.participant_count,
            opinion_groups: clusterState.groups.length,
            consensus_agree: clusterState.consensus.agree.length,
          };
        }

        case "regenerate_summary": {
          state.summary_status = "generating";
          try {
            state.summary = await summarize(
              state.polis_conversation_id,
              adapter,
              state.topic,
            );
            state.summary_status = "complete";
          } catch {
            state.summary_status = "failed";
          }
          return {
            summary_status: state.summary_status,
            summary: state.summary,
          };
        }

        default:
          throw new Error(
            `Unknown action "${action.type}" for ${PROCESS_TYPE}`,
          );
      }
    },

    getReadModel(process, _actor) {
      const state = process.state as unknown as PolisDeliberationState;
      return {
        process_id: process.id,
        type: PROCESS_TYPE,
        lifecycle: process.status,
        topic: state.topic,
        framing: state.framing,
        polis_conversation_id: state.polis_conversation_id || null,
        deadline: state.deadline,
        participation_threshold: state.participation_threshold,
        summary: state.summary,
        summary_status: state.summary_status,
        continued_from_response_id: state.continued_from_response_id,
      };
    },

    getSummary(process) {
      const state = process.state as unknown as PolisDeliberationState;
      return {
        id: process.id,
        process_id: process.id,
        type: PROCESS_TYPE,
        title: (process as any).title ?? state.topic,
        topic: state.topic,
        status: process.status,
        lifecycle: process.status,
        participant_count:
          state.summary?.participation_stats.total_participants ?? 0,
        summary_status: state.summary_status,
      };
    },
  };

  return handler;
}
