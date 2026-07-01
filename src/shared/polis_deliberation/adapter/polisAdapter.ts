import type {
  PolisAdapter,
  PolisAdapterConfig,
  CreateDeliberationInput,
  VoteDirection,
  Statement,
  ClusterState,
  PolisConversationResponse,
  PolisComment,
  PolisMathResult,
  PolisNextCommentResponse,
} from "./types.js";

const RETRY_DELAYS = [500, 1500, 3000];
const REQUEST_TIMEOUT_MS = 15_000;

export function createPolisAdapter(config: PolisAdapterConfig): PolisAdapter {
  const { baseUrl, authToken } = config;

  async function apiFetch<T>(
    path: string,
    opts: RequestInit = {},
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) {
        await sleep(RETRY_DELAYS[attempt - 1]);
      }

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      try {
        const res = await fetch(url, {
          ...opts,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            ...((opts.headers as Record<string, string>) ?? {}),
          },
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          if (res.status >= 500 && attempt < RETRY_DELAYS.length) {
            lastError = new Error(
              `Polis API ${res.status}: ${path} — ${body}`,
            );
            continue;
          }
          throw new Error(`Polis API ${res.status}: ${path} — ${body}`);
        }

        const text = await res.text();
        if (!text) return {} as T;
        return JSON.parse(text) as T;
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          lastError = new Error(`Polis API timeout: ${path}`);
          if (attempt < RETRY_DELAYS.length) continue;
        }
        throw lastError ?? err;
      }
    }

    throw lastError ?? new Error(`Polis API failed: ${path}`);
  }

  const voteMap: Record<VoteDirection, -1 | 0 | 1> = {
    agree: 1,
    disagree: -1,
    pass: 0,
  };

  return {
    async createDeliberation(
      input: CreateDeliberationInput,
    ): Promise<{ conversation_id: string }> {
      const conv = await apiFetch<PolisConversationResponse>(
        "/api/v3/conversations",
        {
          method: "POST",
          body: JSON.stringify({
            topic: input.topic,
            description: input.description,
            is_active: true,
            is_draft: false,
            strict_moderation: input.strict_moderation,
            xid_required: true,
            use_xid_whitelist: false,
          }),
        },
      );

      const conversationId = conv.url.split("/").pop()!;

      if (input.seed_statements?.length) {
        for (const txt of input.seed_statements) {
          await apiFetch("/api/v3/comments", {
            method: "POST",
            body: JSON.stringify({
              conversation_id: conversationId,
              txt,
              is_seed: true,
            }),
          });
        }
      }

      return { conversation_id: conversationId };
    },

    async submitStatement(
      conversationId: string,
      actorXid: string,
      text: string,
    ): Promise<{ statement_id: number }> {
      const result = await apiFetch<{ tid: number }>(
        "/api/v3/comments",
        {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conversationId,
            txt: text,
            xid: actorXid,
          }),
        },
      );
      return { statement_id: result.tid };
    },

    async recordVote(
      conversationId: string,
      actorXid: string,
      statementId: number,
      vote: VoteDirection,
    ): Promise<void> {
      await apiFetch("/api/v3/votes", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conversationId,
          tid: statementId,
          vote: voteMap[vote],
          xid: actorXid,
        }),
      });
    },

    async getNextStatement(
      conversationId: string,
      actorXid: string,
    ): Promise<Statement | null> {
      try {
        // Ensure the participant exists in Polis before requesting statements.
        // Without this, new users who haven't voted/commented get no results.
        await apiFetch("/api/v3/participationInit", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conversationId,
            xid: actorXid,
          }),
        }).catch(() => {});

        const result = await apiFetch<PolisNextCommentResponse>(
          `/api/v3/nextComment?conversation_id=${enc(conversationId)}&xid=${enc(actorXid)}`,
        );
        if (!result || !result.txt) return null;
        return {
          id: result.tid,
          text: result.txt,
          is_seed: result.is_seed ?? false,
          created: result.created,
        };
      } catch {
        return null;
      }
    },

    async pullClusterState(conversationId: string): Promise<ClusterState> {
      const [math, comments] = await Promise.all([
        apiFetch<PolisMathResult>(
          `/api/v3/math/pca2?conversation_id=${enc(conversationId)}`,
        ),
        apiFetch<PolisComment[]>(
          `/api/v3/comments?conversation_id=${enc(conversationId)}&mod=1`,
        ),
      ]);

      const commentTexts = new Map(comments.map((c) => [c.tid, c.txt]));

      const groups = Object.entries(math.repness ?? {}).map(
        ([groupId, repComments]) => {
          const groupVotes = math["group-votes"]?.[groupId];
          return {
            id: Number(groupId),
            size: groupVotes?.["n-members"] ?? 0,
            representative_statements: repComments.slice(0, 5).map((rep) => ({
              text: commentTexts.get(rep.tid) ?? `[statement ${rep.tid}]`,
              direction: rep["repful-for"],
              repness: rep.repness,
            })),
          };
        },
      );

      const mapConsensus = (items: typeof math.consensus.agree) =>
        items.slice(0, 10).map((item) => ({
          statement_id: item.tid,
          text: commentTexts.get(item.tid) ?? `[statement ${item.tid}]`,
          agree_rate: item["p-success"],
          vote_count: item["n-trials"],
        }));

      return {
        participant_count: math.n ?? 0,
        statement_count: math["n-cmts"] ?? 0,
        math_tick: math.math_tick ?? 0,
        groups,
        consensus: {
          agree: mapConsensus(math.consensus?.agree ?? []),
          disagree: mapConsensus(math.consensus?.disagree ?? []),
        },
      };
    },

    async closeDeliberation(conversationId: string): Promise<void> {
      await apiFetch("/api/v3/conversation/close", {
        method: "POST",
        body: JSON.stringify({ conversation_id: conversationId }),
      });
    },

    async getStatements(conversationId: string): Promise<Statement[]> {
      const comments = await apiFetch<PolisComment[]>(
        `/api/v3/comments?conversation_id=${enc(conversationId)}&mod=1`,
      );
      return comments.map((c) => ({
        id: c.tid,
        text: c.txt,
        is_seed: c.is_seed,
        created: c.created,
      }));
    },
  };
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
