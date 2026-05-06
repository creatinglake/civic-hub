import { ActivityPubActor } from "./models.js";
import { ACTOR_CONTEXT } from "./context.js";

export interface HubActorConfig {
  baseUrl: string;
  username: string;
  displayName: string;
  summary: string;
  publicKeyPem: string;
}

export function buildHubActor(config: HubActorConfig): ActivityPubActor {
  const actorId = `${config.baseUrl}/actor`;

  return {
    "@context": ACTOR_CONTEXT,
    id: actorId,
    type: "Service",
    preferredUsername: config.username,
    name: config.displayName,
    summary: config.summary,
    inbox: `${config.baseUrl}/inbox`,
    outbox: `${config.baseUrl}/outbox`,
    url: config.baseUrl,
    publicKey: {
      id: `${actorId}#main-key`,
      owner: actorId,
      publicKeyPem: config.publicKeyPem,
    },
  };
}

export function getActorConfig(): HubActorConfig {
  const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );

  const publicKeyPem = process.env.FEDERATION_PUBLIC_KEY_PEM ?? "";

  return {
    baseUrl,
    username: process.env.HUB_ACTOR_USERNAME ?? "civichub",
    displayName: process.env.HUB_DISPLAY_NAME ?? process.env.VITE_HUB_NAME ?? "Civic Hub",
    summary:
      process.env.HUB_SUMMARY ??
      process.env.VITE_HUB_TAGLINE ??
      "A community-operated civic hub.",
    publicKeyPem,
  };
}
