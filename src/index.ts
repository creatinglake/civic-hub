import express from "express";
import processRoutes from "./routes/processRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import discoveryRoutes from "./routes/discoveryRoutes.js";
import debugRoutes from "./routes/debugRoutes.js";
import inputRoutes from "./routes/inputRoutes.js";
import proposalRoutes from "./routes/proposalRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { seedOnStartup } from "./debug/autoSeed.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// CORS — allow the UI dev server to talk to the API
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

// Auth endpoints — email-based authentication
app.use("/auth", authRoutes);

// --- Internal control surfaces ---
// Process endpoints are internal. External systems should use /events.
app.use("/process", processRoutes);
app.use("/process", inputRoutes);

// Proposal endpoints — user-facing proposal submission and endorsement
app.use("/proposals", proposalRoutes);

// Admin endpoints — proposal review and conversion to votes
app.use("/admin", adminRoutes);

// --- Primary public interfaces ---
// Events are the PRIMARY public interface of the hub.
// All external systems (feeds, dashboards, federation) should rely on events.
app.use("/events", eventRoutes);

// Discovery manifest
app.use("/.well-known", discoveryRoutes);

// Debug / seed (development only)
app.use("/debug", debugRoutes);

// Root — overview of available endpoints
app.get("/", (_req, res) => {
  res.json({
    name: "Civic Hub",
    version: "0.1.0",
    description: "Reference implementation of a Civic Hub backend",
    endpoints: {
      "GET /process": "List all processes (UI read layer)",
      "GET /process/:id/state": "Get UI-friendly process state with tally",
      "POST /process": "Create a new process (internal)",
      "GET /process/:id": "Get a process by ID (internal)",
      "POST /process/:id/action": "Execute an action on a process (internal)",
      "POST /process/:id/input": "Submit community input for a process",
      "GET /process/:id/input": "Get all community inputs for a process",
      "POST /proposals": "Submit a new civic proposal",
      "GET /proposals": "List proposals (optional ?status= filter)",
      "GET /proposals/:id": "Get proposal detail (optional ?actor= for support check)",
      "POST /proposals/:id/support": "Endorse a proposal",
      "GET /admin/proposals": "List proposals for admin review",
      "GET /admin/proposals/:id": "Get full proposal detail for admin",
      "POST /admin/proposals/:id/convert": "Convert endorsed proposal to civic.vote",
      "POST /admin/proposals/:id/archive": "Archive a proposal",
      "POST /auth/request-code": "Request email verification code",
      "POST /auth/verify": "Verify code and get session token",
      "POST /auth/residency": "Affirm Floyd County residency (requires auth)",
      "GET /auth/me": "Get current authenticated user",
      "POST /auth/logout": "Destroy session",
      "GET /events": "List all events (primary public interface)",
      "GET /events?process_id=X": "Filter events by process",
      "GET /events?type=X": "Filter events by type (e.g., civic.process.vote_submitted)",
      "GET /events?process_id=X&type=Y": "Combine filters",
      "GET /events?pretty=true": "Pretty-print event output",
      "GET /.well-known/civic.json": "Discovery manifest",
      "GET /debug/seed": "Seed sample data (dev only)",
      "GET /health": "Health check",
    },
  });
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n🏛️  Civic Hub running at http://localhost:${PORT}`);
  console.log(`   Discovery: http://localhost:${PORT}/.well-known/civic.json`);
  console.log(`   Events:    http://localhost:${PORT}/events`);
  console.log(`   Seed data: http://localhost:${PORT}/debug/seed\n`);

  // Auto-seed the Flock Camera issue on startup
  seedOnStartup();
});
