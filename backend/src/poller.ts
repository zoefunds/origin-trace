import { getContractInfo, getDispute, getDisputeClaims, getClaim, GenlayerBudgetExceededError } from "./genlayer.js";
import {
  upsertDispute,
  upsertClaim,
  getKnownDisputeCount,
  setKnownDisputeCount,
  getStoredDispute,
  getTerminalClaimIds,
  pool,
} from "./db.js";
import { getGenlayerBudgetRemaining } from "./redis.js";

/**
 * The ONLY component in this system that talks to GenLayer RPC. The
 * frontend and the API routes both read exclusively from Postgres/Redis,
 * which is what makes it possible to stay under GenLayer's 5000
 * requests/day ceiling: N users refreshing a dashboard costs zero extra
 * GenLayer requests, because they are all served from the last poll.
 *
 * Sync strategy, tuned hard for request economy -- a naive "refetch every
 * claim of every active dispute on every tick" design burns through the
 * daily budget almost immediately once there's any real activity (a
 * handful of disputes with a handful of claims each turns one poll cycle
 * into dozens of requests, repeated every tick). Instead:
 *
 *  - get_dispute (1 request) is still fetched for every active dispute
 *    every tick -- this is cheap and is the ONLY way to detect a new claim
 *    being filed or a state transition (evaluation/ranking/finalization)
 *    having happened.
 *  - get_dispute_claims + get_claim are only fetched when that
 *    get_dispute call reveals something actually changed: claim_count grew
 *    (new claims filed) or dispute.status differs from what's already
 *    stored (a transition happened, meaning existing claims' fields may
 *    have just been populated/updated by evaluate/finalize). If neither
 *    changed since the last cycle, claims are skipped entirely that tick.
 *  - Within a claims refresh, any claim already stored with a TERMINAL
 *    status (WINNER / LOSER / REFUNDED) is never re-fetched again -- that
 *    status can only ever be set once, by finalize_dispute, and never
 *    changes afterward.
 *  - Terminal DISPUTES (FINALIZED / INCONCLUSIVE / CANCELLED / TIMED_OUT)
 *    drop out of the active-poll set entirely after one more sync.
 *  - New disputes are discovered by walking dispute_id sequence numbers
 *    from get_contract_info().total_disputes, so no "list all disputes"
 *    contract call is needed at all.
 */
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 300_000); // 5 min default
const TERMINAL_STATUSES = new Set(["FINALIZED", "INCONCLUSIVE", "CANCELLED", "TIMED_OUT"]);

async function syncDisputeClaims(disputeId: string): Promise<void> {
  const claimIds = await getDisputeClaims(disputeId);
  const terminalIds = await getTerminalClaimIds(disputeId);

  for (const claimId of claimIds) {
    if (terminalIds.has(claimId)) continue; // can never change again -- zero-cost skip

    const claim = await getClaim(claimId);
    if (!claim || claim.error) continue;
    await upsertClaim({
      claim_id: String(claim.claim_id),
      dispute_id: String(claim.dispute_id),
      claimant: String(claim.claimant),
      artifact_url: String(claim.artifact_url),
      provenance_type: String(claim.provenance_type),
      provenance_hint_url: String(claim.provenance_hint_url ?? ""),
      stake_wei: String(claim.stake_wei),
      stake_deposited: String(claim.stake_deposited),
      status: String(claim.status),
      estimated_earliest_ts: Number(claim.estimated_earliest_ts ?? 0),
      timestamp_verified: Boolean(claim.timestamp_verified),
      match_score_bps: Number(claim.match_score_bps ?? 0),
      evaluation_notes: String(claim.evaluation_notes ?? ""),
      challenge_evidence: Array.isArray(claim.challenge_evidence) ? claim.challenge_evidence : [],
      filed_ts: Number(claim.filed_ts),
      evaluated_ts: Number(claim.evaluated_ts ?? 0),
    });
  }
}

async function syncDispute(disputeId: string): Promise<{ claimsFetched: boolean }> {
  const previouslyStored = await getStoredDispute(disputeId); // Postgres read, zero GenLayer cost

  const dispute = await getDispute(disputeId);
  if (!dispute || dispute.error) return { claimsFetched: false };

  const freshStatus = String(dispute.status);
  const freshClaimCount = Number(dispute.claim_count);

  await upsertDispute({
    dispute_id: String(dispute.dispute_id),
    creator: String(dispute.creator),
    idea_title: String(dispute.idea_title),
    idea_description: String(dispute.idea_description),
    status: freshStatus,
    required_stake_wei: String(dispute.required_stake_wei),
    stake_pool_deposited: String(dispute.stake_pool_deposited),
    claim_count: freshClaimCount,
    created_ts: Number(dispute.created_ts),
    filing_deadline_ts: Number(dispute.filing_deadline_ts),
    evaluation_timeout_ts: Number(dispute.evaluation_timeout_ts),
    leading_claim_id: String(dispute.leading_claim_id ?? ""),
    ranking_verdict: String(dispute.ranking_verdict ?? ""),
    ranking_rationale: String(dispute.ranking_rationale ?? ""),
    ranked_ts: Number(dispute.ranked_ts ?? 0),
    challenge_deadline_ts: Number(dispute.challenge_deadline_ts ?? 0),
    had_challenge_evidence: Boolean(dispute.had_challenge_evidence),
    final_winner_claim_id: String(dispute.final_winner_claim_id ?? ""),
    finalized_ts: Number(dispute.finalized_ts ?? 0),
  });

  const isFirstSync = previouslyStored === null;
  const claimCountGrew = !previouslyStored || freshClaimCount > previouslyStored.claim_count;
  const statusChanged = !previouslyStored || previouslyStored.status !== freshStatus;

  if (isFirstSync && freshClaimCount === 0) {
    // Brand-new dispute with nothing filed yet -- nothing to fetch.
    return { claimsFetched: false };
  }
  if (!claimCountGrew && !statusChanged) {
    // Nothing that could affect claim data has happened since last cycle.
    return { claimsFetched: false };
  }

  await syncDisputeClaims(disputeId);
  return { claimsFetched: true };
}

async function pollOnce(): Promise<void> {
  const budgetRemaining = await getGenlayerBudgetRemaining();
  if (budgetRemaining < 20) {
    console.warn(`[poller] daily budget nearly exhausted (${budgetRemaining} left) -- skipping this cycle`);
    return;
  }

  try {
    const info = await getContractInfo();
    const totalDisputes = Number(info.total_disputes ?? 0);
    const knownCount = await getKnownDisputeCount();

    // Discover and sync any brand-new disputes since the last cycle.
    for (let i = knownCount; i < totalDisputes; i++) {
      await syncDispute(`dispute:${i}`);
    }
    if (totalDisputes !== knownCount) {
      await setKnownDisputeCount(totalDisputes);
    }

    // Re-sync every dispute that is not yet in a terminal state.
    const { rows } = await pool.query<{ dispute_id: string; status: string }>(
      "SELECT dispute_id, status FROM disputes WHERE status <> ALL($1)",
      [Array.from(TERMINAL_STATUSES)]
    );
    let claimsFetchedCount = 0;
    for (const row of rows) {
      const result = await syncDispute(row.dispute_id);
      if (result.claimsFetched) claimsFetchedCount++;
    }

    console.log(
      `[poller] cycle complete: ${totalDisputes} total disputes, ${rows.length} active re-synced, ` +
        `${claimsFetchedCount} had claim changes worth fetching`
    );
  } catch (err) {
    if (err instanceof GenlayerBudgetExceededError) {
      console.warn("[poller]", err.message);
      return;
    }
    console.error("[poller] cycle failed:", err);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startPoller(): void {
  if (timer) return;
  // Run once immediately, then on the fixed interval. Errors in one cycle
  // must never stop future cycles -- this is the "backend must be 24/7"
  // requirement in miniature.
  void pollOnce();
  timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
