import type { CreateEventInput } from "../../models/event.js";

export type EmitEventFn = (input: CreateEventInput) => Promise<unknown>;

const HUB_ID = "civic-hub-local";

interface EventContext {
  project_id: string;
  hub_id?: string;
  jurisdiction?: string;
  emit: EmitEventFn;
}

export async function emitProjectCreated(
  ctx: EventContext,
  actor: string,
  data: { title: string },
): Promise<void> {
  await ctx.emit({
    event_type: "civic.project.created",
    actor,
    process_id: ctx.project_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    action_url_path: `/project/${ctx.project_id}`,
    data: { project: data },
  });
}

export async function emitProjectUpdated(
  ctx: EventContext,
  actor: string,
  data: { update_id: string },
): Promise<void> {
  await ctx.emit({
    event_type: "civic.project.updated",
    actor,
    process_id: ctx.project_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    action_url_path: `/project/${ctx.project_id}`,
    data: { project: data },
  });
}

export async function emitProjectCommented(
  ctx: EventContext,
  actor: string,
  data: { comment_id: string },
): Promise<void> {
  await ctx.emit({
    event_type: "civic.project.comment_added",
    actor,
    process_id: ctx.project_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    action_url_path: `/project/${ctx.project_id}`,
    data: { project: data },
  });
}

export async function emitProjectSentimentChanged(
  ctx: EventContext,
  actor: string,
  data: { sentiment: string; support_count: number; oppose_count: number },
): Promise<void> {
  await ctx.emit({
    event_type: "civic.project.sentiment_changed",
    actor,
    process_id: ctx.project_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    action_url_path: `/project/${ctx.project_id}`,
    data: { project: data },
  });
}
