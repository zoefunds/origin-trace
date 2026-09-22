import "dotenv/config";
import express from "express";
import cors from "cors";
import { runMigrations } from "./db.js";
import { startPoller } from "./poller.js";
import { disputesRouter } from "./routes/disputes.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/healthz", (_req, res) => res.json({ ok: true, service: "origin-trace-backend" }));
app.use("/api/disputes", disputesRouter);

const PORT = Number(process.env.PORT || 8080);

async function main() {
  await runMigrations();
  startPoller();
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

// Top-level crash guards: this service must run 24/7. An unhandled
// rejection or exception must be logged, never silently kill the process
// out from under the poller/API.
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

main().catch((err) => {
  console.error("[fatal] failed to start:", err);
  process.exit(1);
});
