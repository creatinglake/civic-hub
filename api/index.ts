// Vercel serverless function — wraps the Express app.
//
// All /api/* requests are routed here by vercel.json.
// We strip the /api prefix so Express routes match (e.g., /api/process → /process).
// The Express app auto-seeds on first import (cold start).

import type { IncomingMessage, ServerResponse } from "http";
import app from "../src/app.js";

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // Strip /api prefix so Express routes match their registered paths
  req.url = req.url!.replace(/^\/api/, "") || "/";

  // Let Express handle it
  app(req, res);
}
