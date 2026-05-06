import { Request, Response, NextFunction } from "express";
import { wantsActivityPub } from "../modules/civic.federation/index.js";

function federationEnabled(): boolean {
  return process.env.FEDERATION_ENABLED !== "false";
}

export function applyFederationContentNegotiation(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (federationEnabled() && wantsActivityPub(req.headers.accept)) {
    res.locals.wantsActivityPub = true;
  }
  next();
}

export function requireFederationEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!federationEnabled()) {
    res.status(404).json({ error: "Federation is not enabled on this hub" });
    return;
  }
  next();
}
