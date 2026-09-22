import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { Dispute, Claim, TransactionReceipt } from "./types";
import { estimateWriteFeePreset, feePresetToTransactionFees, type FeePresetEstimate } from "../genlayer/fees";

// NOTE on wallet signing: this mirrors the working pattern from the sibling
// GenLayer project (proof-of-work/frontend/lib/contracts/ProofOfWork.ts),
// which signs transactions through window.ethereum. That covers MetaMask
// and any other extension injected as window.ethereum (which Reown AppKit
// also exposes as its "injected" connector). A WalletConnect-only remote
// session (no injected provider in this browser at all) needs genlayer-js's
// WalletConnect-via-viem bridging verified against the current genlayer-js
// SDK reference before shipping to users who exclusively use mobile/remote
// wallets -- do not guess at an unverified API here. Track this as a known
// gap rather than silently pretending it's covered.

const FAILED_TX_STATUSES = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);
const COMMITTED_TX_STATUSES = new Set(["ACCEPTED", "FINALIZED", "READY_TO_FINALIZE"]);
const FAILED_TX_RESULTS = new Set(["MAJORITY_DISAGREE", "NO_MAJORITY", "DETERMINISTIC_VIOLATION", "DISAGREE", "TIMEOUT", "FAILURE"]);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  const rec = value as Record<string, unknown>;
  if (typeof rec?.as_hex === "string") return rec.as_hex;
  return String(value);
}

function asBigInt(value: unknown): bigint {
  const text = asText(value || "0") || "0";
  try {
    return BigInt(text);
  } catch {
    return 0n;
  }
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return asText(value).toLowerCase() === "true";
}

function asDispute(raw: unknown): Dispute {
  const rec = asRecord(raw);
  return {
    dispute_id: asText(rec.dispute_id),
    creator: asText(rec.creator),
    idea_title: asText(rec.idea_title),
    idea_description: asText(rec.idea_description),
    status: asText(rec.status) as Dispute["status"],
    required_stake_wei: asBigInt(rec.required_stake_wei),
    stake_pool_deposited: asBigInt(rec.stake_pool_deposited),
    claim_count: Number(rec.claim_count || 0),
    created_ts: Number(rec.created_ts || 0),
    filing_deadline_ts: Number(rec.filing_deadline_ts || 0),
    evaluation_timeout_ts: Number(rec.evaluation_timeout_ts || 0),
    leading_claim_id: asText(rec.leading_claim_id),
    ranking_verdict: asText(rec.ranking_verdict),
    ranking_rationale: asText(rec.ranking_rationale),
    ranked_ts: Number(rec.ranked_ts || 0),
    challenge_deadline_ts: Number(rec.challenge_deadline_ts || 0),
    had_challenge_evidence: asBool(rec.had_challenge_evidence),
    final_winner_claim_id: asText(rec.final_winner_claim_id),
    finalized_ts: Number(rec.finalized_ts || 0),
  };
}

function asClaim(raw: unknown): Claim {
  const rec = asRecord(raw);
  const evidence = rec.challenge_evidence;
  return {
    claim_id: asText(rec.claim_id),
    dispute_id: asText(rec.dispute_id),
    claimant: asText(rec.claimant),
    artifact_url: asText(rec.artifact_url),
    provenance_type: asText(rec.provenance_type) as Claim["provenance_type"],
    provenance_hint_url: asText(rec.provenance_hint_url),
    stake_wei: asBigInt(rec.stake_wei),
    stake_deposited: asBigInt(rec.stake_deposited),
    status: asText(rec.status) as Claim["status"],
    estimated_earliest_ts: Number(rec.estimated_earliest_ts || 0),
    timestamp_verified: asBool(rec.timestamp_verified),
    match_score_bps: Number(rec.match_score_bps || 0),
    evaluation_notes: asText(rec.evaluation_notes),
    challenge_evidence: Array.isArray(evidence) ? (evidence as string[]) : [],
    filed_ts: Number(rec.filed_ts || 0),
    evaluated_ts: Number(rec.evaluated_ts || 0),
  };
}

function readableContractError(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(?:UserError|Exception|Error):\s*(.+)$/i);
  return match?.[1]?.trim() || cleaned;
}

function leaderErrorDetail(receipt: any, fallback: string): string {
  const leader = receipt?.consensus_data?.leader_receipt;
  const rec = Array.isArray(leader) ? leader[0] : leader;
  const payload = rec?.result?.payload ?? rec?.result;
  if (typeof payload === "string" && payload.trim()) return readableContractError(payload);
  if (payload && typeof payload === "object") {
    const readable = (payload as any).readable ?? (payload as any).payload;
    if (typeof readable === "string" && readable.trim()) return readableContractError(readable);
  }
  return fallback;
}

function assertSuccessfulReceipt(receipt: any): void {
  const statusName = String(receipt?.statusName || receipt?.status_name || receipt?.status || "").toUpperCase();
  if (!statusName || FAILED_TX_STATUSES.has(statusName)) {
    throw new Error(`The network did not reach consensus (${statusName || "UNKNOWN"}). Please try again.`);
  }
  if (!COMMITTED_TX_STATUSES.has(statusName)) {
    throw new Error(`Transaction is not committed yet (${statusName}). Please try again.`);
  }
  const resultName = String(receipt?.resultName || receipt?.result_name || "").toUpperCase();
  if (resultName && FAILED_TX_RESULTS.has(resultName)) {
    throw new Error(`Validators disagreed (${resultName}). Please try again.`);
  }
  const execution = String(
    receipt?.txExecutionResultName || receipt?.tx_execution_result_name || receipt?.txExecutionResult || ""
  ).toUpperCase();
  if (execution && execution !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(`Contract execution failed: ${leaderErrorDetail(receipt, execution)}`);
  }
}

function buildClient(address?: string | null, studioUrl?: string) {
  const rpcUrl = studioUrl || "https://studio.genlayer.com/api";
  const chain = { ...studionet, rpcUrls: { default: { http: [rpcUrl] } } };
  const config: any = { chain, endpoint: rpcUrl };
  if (address) config.account = address as `0x${string}`;
  return createClient(config);
}

const GEN_DECIMALS = 18n;
export function genToWei(gen: string | number): bigint {
  const [whole, frac = ""] = String(gen).split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole || "0") * 10n ** GEN_DECIMALS + BigInt(fracPadded || "0");
}

class OriginTraceContract {
  private contractAddress: `0x${string}`;
  private client: any;
  private studioUrl?: string;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.studioUrl = studioUrl;
    this.client = buildClient(address, studioUrl);
  }

  updateAccount(address: string): void {
    this.client = buildClient(address, this.studioUrl);
  }

  private async read(functionName: string, args: unknown[] = []) {
    return this.client.readContract({ address: this.contractAddress, functionName, args });
  }

  private async write(
    functionName: string,
    args: unknown[],
    value: bigint,
    retries = 80,
    interval = 5000
  ): Promise<TransactionReceipt> {
    const feePreset: FeePresetEstimate | undefined = await estimateWriteFeePreset(
      this.client,
      { address: this.contractAddress, functionName, args, value },
      "standard"
    );
    const fees = feePresetToTransactionFees(feePreset);
    const txHash = await this.client.writeContract({
      address: this.contractAddress,
      functionName,
      args,
      value,
      ...(fees ? { fees } : {}),
    });
    const receipt = await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: TransactionStatus.ACCEPTED,
      retries,
      interval,
    });
    assertSuccessfulReceipt(receipt);
    return { ...(receipt as TransactionReceipt), hash: (receipt as any)?.hash || txHash, payload: asRecord(receipt) };
  }

  // -- reads --------------------------------------------------------------

  async getDispute(disputeId: string): Promise<Dispute> {
    return asDispute(await this.read("get_dispute", [disputeId]));
  }

  async getClaim(claimId: string): Promise<Claim> {
    return asClaim(await this.read("get_claim", [claimId]));
  }

  async getDisputeClaimIds(disputeId: string): Promise<string[]> {
    const raw = await this.read("get_dispute_claims", [disputeId]);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  }

  async getContractInfo() {
    return asRecord(await this.read("get_contract_info"));
  }

  // -- writes ---------------------------------------------------------------

  createDispute(
    ideaTitle: string,
    ideaDescription: string,
    requiredStakeWei: bigint,
    filingWindowSeconds: number,
    challengeWindowSeconds: number
  ) {
    return this.write(
      "create_dispute",
      [ideaTitle, ideaDescription, Number(requiredStakeWei), filingWindowSeconds, challengeWindowSeconds],
      0n
    );
  }

  cancelDispute(disputeId: string) {
    return this.write("cancel_dispute", [disputeId], 0n);
  }

  fileClaim(disputeId: string, artifactUrl: string, provenanceType: string, provenanceHintUrl: string, stakeWei: bigint) {
    return this.write("file_claim", [disputeId, artifactUrl, provenanceType, provenanceHintUrl], stakeWei);
  }

  triggerEvaluation(disputeId: string) {
    // Evaluation involves the nondeterministic web-fetch + LLM consensus
    // path -- give it a much longer poll budget than an ordinary write.
    return this.write("trigger_evaluation", [disputeId], 0n, 240, 8000);
  }

  submitChallengeEvidence(claimId: string, evidenceUrl: string) {
    return this.write("submit_challenge_evidence", [claimId, evidenceUrl], 0n);
  }

  finalizeDispute(disputeId: string) {
    return this.write("finalize_dispute", [disputeId], 0n, 240, 8000);
  }

  withdraw(claimId: string) {
    return this.write("withdraw", [claimId], 0n);
  }

  claimSingleFilerRefund(disputeId: string) {
    return this.write("claim_single_filer_refund", [disputeId], 0n);
  }

  claimDisputeTimeout(disputeId: string) {
    return this.write("claim_dispute_timeout", [disputeId], 0n);
  }
}

export default OriginTraceContract;
