import express from "express";
import processRoutes from "./routes/processRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import discoveryRoutes from "./routes/discoveryRoutes.js";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.use(express.json());

// Routes
app.use("/process", processRoutes);
app.use("/events", eventRoutes);
app.use("/.well-known", discoveryRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Civic Hub running at http://localhost:${PORT}`);
  console.log(`Discovery manifest: http://localhost:${PORT}/.well-known/civic.json`);
});
