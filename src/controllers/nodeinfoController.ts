import { Request, Response } from "express";
import { baseUrl } from "../utils/baseUrl.js";

export function handleNodeInfoWellKnown(_req: Request, res: Response): void {
  const hub = baseUrl();
  res.json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${hub}/nodeinfo/2.0`,
      },
    ],
  });
}

export function handleNodeInfo(_req: Request, res: Response): void {
  res.json({
    version: "2.0",
    software: {
      name: "civic-hub",
      version: "0.1.0",
    },
    protocols: ["activitypub"],
    usage: {
      users: { total: 0, activeMonth: 0, activeHalfyear: 0 },
      localPosts: 0,
    },
    openRegistrations: false,
  });
}
