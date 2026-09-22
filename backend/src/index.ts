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
  const server = app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
  // A failure to bind the port (EADDRINUSE, permission denied, etc.) means
  // there is no HTTP server at all -- this must crash loudly and let Fly's
  // process supervisor restart the machine, never linger as a process that
  // logs "healthy" while serving nothing.
  server.on("error", (err) => {
    console.error("[fatal] failed to bind HTTP server:", err);
    process.exit(1);
  });
}

// Top-level crash guards for errors that happen AFTER startup: this service
// must run 24/7, so a transient error in one request or one poll cycle must
// be logged and survived, never silently kill the process out from under
// everything else that's still healthy.
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));
process.on("uncaughtException", (err) => console.error("[uncaughtException]", err));

main().catch((err) => {
  console.error("[fatal] failed to start:", err);
  process.exit(1);
});
