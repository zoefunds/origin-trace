// Client for the ORIGIN TRACE backend's cached read API. All dispute/claim
// LISTING and browsing goes through here (Postgres + Redis cached, synced
// by the backend's poller) instead of hitting GenLayer RPC directly from
// every browser tab -- this is what keeps the app within GenLayer's daily
// request budget regardless of how many people are looking at it. Writes
// and single-record "did my just-submitted transaction land yet" reads
// still go straight to the contract via lib/contracts/OriginTrace.ts.

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "https://origin-trace-backend-starlit-sound-5755.fly.dev";

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}): ${path}`);
  }
  return res.json();
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
  challenge_deadline_ts: number;
  ranking_verdict: string;
  final_winner_claim_id: string;
}

export interface ClaimRow {
  claim_id: string;
  dispute_id: string;
  claimant: string;
  artifact_url: string;
  provenance_type: string;
  stake_deposited: string;
  status: string;
  estimated_earliest_ts: number;
  timestamp_verified: boolean;
  match_score_bps: number;
  evaluation_notes: string;
  filed_ts: number;
}

export async function listDisputes(status?: string): Promise<DisputeRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await apiFetch<{ disputes: DisputeRow[] }>(`/api/disputes${query}`);
  return data.disputes;
}

export async function getDisputeCached(id: string): Promise<DisputeRow | null> {
  try {
    const data = await apiFetch<{ dispute: DisputeRow }>(`/api/disputes/${id}`);
    return data.dispute;
  } catch {
    return null;
  }
}

export async function getDisputeClaimsCached(id: string): Promise<ClaimRow[]> {
  const data = await apiFetch<{ claims: ClaimRow[] }>(`/api/disputes/${id}/claims`);
  return data.claims;
}

export async function getActivityForAddress(address: string): Promise<{ created: DisputeRow[]; claims: ClaimRow[] }> {
  return apiFetch(`/api/disputes/by-address/${address}`);
}
