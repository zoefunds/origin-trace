import { Router } from "express";
import { pool } from "../db.js";
import { cached, getGenlayerBudgetRemaining } from "../redis.js";

export const disputesRouter = Router();

/**
 * Every route here reads from Postgres (already synced by the poller) and
 * is additionally wrapped in a short Redis cache -- this means a page of
 * concurrent users hammering /api/disputes costs at most one Postgres
 * query per cache window and ZERO GenLayer RPC requests, regardless of
 * traffic volume.
 */

disputesRouter.get("/", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const key = `api:disputes:list:${status ?? "all"}`;
  const data = await cached(key, 15, async () => {
    const { rows } = status
      ? await pool.query("SELECT * FROM disputes WHERE status = $1 ORDER BY created_ts DESC LIMIT 200", [status])
      : await pool.query("SELECT * FROM disputes ORDER BY created_ts DESC LIMIT 200");
    return rows;
  });
  res.json({ disputes: data });
});

disputesRouter.get("/:id", async (req, res) => {
  const key = `api:disputes:one:${req.params.id}`;
  const data = await cached(key, 10, async () => {
    const { rows } = await pool.query("SELECT * FROM disputes WHERE dispute_id = $1", [req.params.id]);
    return rows[0] ?? null;
  });
  if (!data) return res.status(404).json({ error: "not_found" });
  res.json({ dispute: data });
});

disputesRouter.get("/:id/claims", async (req, res) => {
  const key = `api:disputes:claims:${req.params.id}`;
  const data = await cached(key, 10, async () => {
    const { rows } = await pool.query(
      "SELECT * FROM claims WHERE dispute_id = $1 ORDER BY filed_ts ASC",
      [req.params.id]
    );
    return rows;
  });
  res.json({ claims: data });
});

disputesRouter.get("/by-address/:address", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const key = `api:disputes:by-address:${address}`;
  const data = await cached(key, 15, async () => {
    const created = await pool.query("SELECT * FROM disputes WHERE lower(creator) = $1 ORDER BY created_ts DESC", [address]);
    const claimed = await pool.query("SELECT * FROM claims WHERE lower(claimant) = $1 ORDER BY filed_ts DESC", [address]);
    return { created: created.rows, claims: claimed.rows };
  });
  res.json(data);
});

disputesRouter.get("/_meta/budget", async (_req, res) => {
  res.json({ genlayer_requests_remaining_today: await getGenlayerBudgetRemaining() });
});
