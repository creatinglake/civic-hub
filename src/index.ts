import express from "express";
import processRoutes from "./routes/processRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import discoveryRoutes from "./routes/discoveryRoutes.js";
import debugRoutes from "./routes/debugRoutes.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// CORS — allow the UI dev server to talk to the API
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

// --- Internal control surfaces ---
// Process endpoints are internal. External systems should use /events.
app.use("/process", processRoutes);

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
      "GET /events": "List all events (primary public interface)",
      "GET /events?process_id=X": "Filter events by process",
      "GET /events?type=X": "Filter events by type (e.g., vote.submitted)",
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
});
