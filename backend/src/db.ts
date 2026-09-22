import pg from "pg";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const sql = readFileSync(path.join(__dirname, "..", "migrations", "001_init.sql"), "utf-8");
  await pool.query(sql);
  console.log("[db] migrations applied");
}

export interface DisputeRow {
  dispute_id: string;
  creator: string;
  idea_title: string;
  idea_description: string;
  status: string;
  required_stake_wei: string;
  stake_pool_deposited: string;
  claim_count: number;
  created_ts: number;
  filing_deadline_ts: number;
  evaluation_timeout_ts: number;
  leading_claim_id: string;
  ranking_verdict: string;
  ranking_rationale: string;
  ranked_ts: number;
  challenge_deadline_ts: number;
  had_challenge_evidence: boolean;
  final_winner_claim_id: string;
  finalized_ts: number;
}

export async function upsertDispute(d: DisputeRow): Promise<void> {
  await pool.query(
    `INSERT INTO disputes (
      dispute_id, creator, idea_title, idea_description, status,
      required_stake_wei, stake_pool_deposited, claim_count, created_ts,
      filing_deadline_ts, evaluation_timeout_ts, leading_claim_id,
      ranking_verdict, ranking_rationale, ranked_ts, challenge_deadline_ts,
      had_challenge_evidence, final_winner_claim_id, finalized_ts, last_synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now())
    ON CONFLICT (dispute_id) DO UPDATE SET
      status = EXCLUDED.status,
      stake_pool_deposited = EXCLUDED.stake_pool_deposited,
      claim_count = EXCLUDED.claim_count,
      leading_claim_id = EXCLUDED.leading_claim_id,
      ranking_verdict = EXCLUDED.ranking_verdict,
      ranking_rationale = EXCLUDED.ranking_rationale,
      ranked_ts = EXCLUDED.ranked_ts,
      challenge_deadline_ts = EXCLUDED.challenge_deadline_ts,
      had_challenge_evidence = EXCLUDED.had_challenge_evidence,
      final_winner_claim_id = EXCLUDED.final_winner_claim_id,
      finalized_ts = EXCLUDED.finalized_ts,
      last_synced_at = now()
    `,
    [
      d.dispute_id, d.creator, d.idea_title, d.idea_description, d.status,
      d.required_stake_wei, d.stake_pool_deposited, d.claim_count, d.created_ts,
      d.filing_deadline_ts, d.evaluation_timeout_ts, d.leading_claim_id,
      d.ranking_verdict, d.ranking_rationale, d.ranked_ts, d.challenge_deadline_ts,
      d.had_challenge_evidence, d.final_winner_claim_id, d.finalized_ts,
    ]
  );
}

export interface ClaimRow {
  claim_id: string;
  dispute_id: string;
  claimant: string;
  artifact_url: string;
  provenance_type: string;
  provenance_hint_url: string;
  stake_wei: string;
  stake_deposited: string;
  status: string;
  estimated_earliest_ts: number;
  timestamp_verified: boolean;
  match_score_bps: number;
  evaluation_notes: string;
  challenge_evidence: unknown[];
  filed_ts: number;
  evaluated_ts: number;
}

export async function upsertClaim(c: ClaimRow): Promise<void> {
  await pool.query(
    `INSERT INTO claims (
      claim_id, dispute_id, claimant, artifact_url, provenance_type,
      provenance_hint_url, stake_wei, stake_deposited, status,
      estimated_earliest_ts, timestamp_verified, match_score_bps,
      evaluation_notes, challenge_evidence, filed_ts, evaluated_ts, last_synced_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
    ON CONFLICT (claim_id) DO UPDATE SET
      status = EXCLUDED.status,
      stake_deposited = EXCLUDED.stake_deposited,
      estimated_earliest_ts = EXCLUDED.estimated_earliest_ts,
      timestamp_verified = EXCLUDED.timestamp_verified,
      match_score_bps = EXCLUDED.match_score_bps,
      evaluation_notes = EXCLUDED.evaluation_notes,
      challenge_evidence = EXCLUDED.challenge_evidence,
      evaluated_ts = EXCLUDED.evaluated_ts,
      last_synced_at = now()
    `,
    [
      c.claim_id, c.dispute_id, c.claimant, c.artifact_url, c.provenance_type,
      c.provenance_hint_url, c.stake_wei, c.stake_deposited, c.status,
      c.estimated_earliest_ts, c.timestamp_verified, c.match_score_bps,
      c.evaluation_notes, JSON.stringify(c.challenge_evidence), c.filed_ts, c.evaluated_ts,
    ]
  );
}

export async function getStoredDispute(disputeId: string): Promise<DisputeRow | null> {
  const res = await pool.query("SELECT * FROM disputes WHERE dispute_id = $1", [disputeId]);
  return res.rows[0] ?? null;
}

const CLAIM_TERMINAL_STATUSES = ["WINNER", "LOSER", "REFUNDED"];

/** claim_ids already stored whose status can never change again -- safe to
 * skip re-fetching forever, this is the single biggest lever for staying
 * under GenLayer's request budget once a protocol has any real activity. */
export async function getTerminalClaimIds(disputeId: string): Promise<Set<string>> {
  const res = await pool.query("SELECT claim_id FROM claims WHERE dispute_id = $1 AND status = ANY($2)", [
    disputeId,
    CLAIM_TERMINAL_STATUSES,
  ]);
  return new Set(res.rows.map((r) => r.claim_id as string));
}

export async function getKnownDisputeCount(): Promise<number> {
  const res = await pool.query("SELECT known_dispute_count FROM sync_state WHERE id = 1");
  return res.rows[0]?.known_dispute_count ?? 0;
}

export async function setKnownDisputeCount(n: number): Promise<void> {
  await pool.query(
    "UPDATE sync_state SET known_dispute_count = $1, last_full_sync_at = now() WHERE id = 1",
    [n]
  );
}
