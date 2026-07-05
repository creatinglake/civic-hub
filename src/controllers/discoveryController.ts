// Discovery controller — serves the /.well-known/civic.json manifest
// As defined in the Civic Hub Spec v0.1

import { Request, Response } from "express";
import { baseUrl } from "../utils/baseUrl.js";
import { getRegisteredTypes } from "../processes/registry.js";
import { HUB_ID, DEFAULT_JURISDICTION } from "../config/hub.js";

export function handleDiscoveryManifest(_req: Request, res: Response): void {
  const hub = baseUrl();
  // Spec §3.0 requires `jurisdictions` for indexer discovery. Sourced from
  // env so each deployed hub advertises its own; defaults to "local" to match
  // the jurisdiction the hub actually stamps on emitted events.
  const jurisdiction = DEFAULT_JURISDICTION;

  const manifest = {
    name: "Civic Hub Reference Implementation",
    version: "0.1.0",
    description:
      "A minimal reference implementation of a Civic Hub backend for community governance",
    jurisdictions: [jurisdiction],
    hub: {
      id: HUB_ID,
      type: "civic.hub",
    },
    endpoints: {
      processes: `${hub}/process`,
      events: `${hub}/events`,
    },
    feeds: {
      events: `${hub}/events`,
    },
    capabilities: getRegisteredTypes(),
    spec: {
      process: "civic-process-spec-v0.1",
      event: "civic-event-spec-v0.1",
      hub: "civic-hub-spec-v0.1",
    },
  };

  res.json(manifest);
}
