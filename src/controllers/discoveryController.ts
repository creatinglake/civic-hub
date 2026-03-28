// Discovery controller — serves the /.well-known/civic.json manifest
// As defined in the Civic Hub Spec v0.1

import { Request, Response } from "express";

export function handleDiscoveryManifest(_req: Request, res: Response): void {
  const baseUrl =
    process.env.BASE_URL ?? "http://localhost:3000";

  const manifest = {
    name: "Civic Hub Reference Implementation",
    version: "0.1.0",
    description:
      "A minimal reference implementation of a Civic Hub backend for community governance",
    hub: {
      id: "civic-hub-local",
      type: "civic.hub",
    },
    endpoints: {
      processes: `${baseUrl}/process`,
      events: `${baseUrl}/events`,
    },
    feeds: {
      events: `${baseUrl}/events`,
    },
    capabilities: ["civic.vote", "civic.proposal"],
    spec: {
      process: "civic-process-spec-v0.1",
      event: "civic-event-spec-v0.1",
      hub: "civic-hub-spec-v0.1",
    },
  };

  res.json(manifest);
}
