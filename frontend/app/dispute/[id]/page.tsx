"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDisputeCached, getDisputeClaimsCached } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { formatAddress, formatGen, formatUnixTs, formatCountdown } from "@/lib/format";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import OriginTraceContract from "@/lib/contracts/OriginTrace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;

const PROVENANCE_OPTIONS = [
  { value: "WAYBACK", label: "Web Archive (Wayback Machine snapshot)" },
  { value: "GIT_COMMIT", label: "Git commit (GitHub/GitLab commit API)" },
  { value: "PLATFORM_PUBLISH", label: "Platform-reported publish metadata" },
];

function useContract() {
  const { address } = useWallet();
  return CONTRACT_ADDRESS ? new OriginTraceContract(CONTRACT_ADDRESS, address, RPC_URL) : null;
}

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { address, isConnected } = useWallet();
  const contract = useContract();

  const [busy, setBusy] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [artifactUrl, setArtifactUrl] = useState("");
  const [provenanceType, setProvenanceType] = useState("WAYBACK");
  const [provenanceHintUrl, setProvenanceHintUrl] = useState("");
  const [challengeUrlByClaim, setChallengeUrlByClaim] = useState<Record<string, string>>({});

  const disputeQuery = useQuery({
    queryKey: ["dispute", id],
    queryFn: () => getDisputeCached(id),
    refetchInterval: 15_000,
  });
  const claimsQuery = useQuery({
    queryKey: ["dispute-claims", id],
    queryFn: () => getDisputeClaimsCached(id),
    refetchInterval: 15_000,
  });

  const dispute = disputeQuery.data;
  const claims = claimsQuery.data ?? [];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["dispute", id] });
    queryClient.invalidateQueries({ queryKey: ["dispute-claims", id] });
  }

  async function withBusyState(key: string, fn: () => Promise<void>) {
    setErrorMsg(null);
    setBusy(key);
    try {
      await fn();
      invalidate();
    } catch (err: any) {
      setErrorMsg(err?.message || "Transaction failed.");
    } finally {
      setBusy(null);
    }
  }

  if (disputeQuery.isLoading) return <p className="text-muted-foreground">Loading dispute…</p>;
  if (!dispute) return <p className="text-muted-foreground">Dispute not found.</p>;

  const myClaim = claims.find((c) => c.claimant?.toLowerCase() === address?.toLowerCase());
  const canFileClaim = dispute.status === "FILING_OPEN" && isConnected && !myClaim;
  const canTriggerEval = dispute.status === "FILING_OPEN" && dispute.claim_count >= 2;
  const canFinalize = dispute.status === "RANKED";
  const isMyClaimWithdrawable =
    myClaim && (myClaim.status === "WINNER" || myClaim.status === "REFUNDED");

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <StatusBadge status={dispute.status} />
          <span className="font-mono text-xs text-muted-foreground">{dispute.dispute_id}</span>
        </div>
        <h1 className="text-2xl font-semibold">{dispute.idea_title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{dispute.idea_description}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 font-mono text-xs text-muted-foreground">
          <span>Creator: {formatAddress(dispute.creator)}</span>
          <span>Stake pool: {formatGen(dispute.stake_pool_deposited)} GEN</span>
          <span>Claims: {dispute.claim_count}</span>
          {dispute.status === "FILING_OPEN" && (
            <span>Filing closes: {formatCountdown(dispute.filing_deadline_ts)}</span>
          )}
          {dispute.status === "RANKED" && (
            <span>Challenge closes: {formatCountdown(dispute.challenge_deadline_ts)}</span>
          )}
        </div>
        {dispute.ranking_verdict && (
          <Alert>
            <AlertDescription className="font-mono text-xs">
              Verdict: {dispute.ranking_verdict}
              {dispute.final_winner_claim_id ? ` — winner: ${dispute.final_winner_claim_id}` : ""}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {errorMsg && (
        <Alert variant="destructive">
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {!CONTRACT_ADDRESS && (
        <Alert variant="destructive">
          <AlertDescription>
            NEXT_PUBLIC_CONTRACT_ADDRESS is not configured — writes are disabled until the
            contract is deployed and the address is set.
          </AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        <h2 className="font-mono text-sm uppercase tracking-wide text-muted-foreground">
          Claims ({claims.length})
        </h2>
        <div className="space-y-3">
          {claims.map((c) => (
            <div key={c.claim_id} className="rounded-md border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="badge-lifecycle badge-inconclusive mr-2">{c.status}</span>
                  <span className="font-mono text-xs text-muted-foreground">{formatAddress(c.claimant)}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  staked {formatGen(c.stake_deposited)} GEN
                </span>
              </div>
              <a
                href={c.artifact_url}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="mt-2 block truncate text-sm text-primary hover:underline"
              >
                {c.artifact_url}
              </a>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                provenance: {c.provenance_type}
                {c.timestamp_verified && (
                  <> · verified earliest: {formatUnixTs(c.estimated_earliest_ts)}</>
                )}
                {c.status !== "FILED" && <> · match score: {(c.match_score_bps / 100).toFixed(1)}%</>}
              </div>
              {c.evaluation_notes && (
                <p className="mt-2 text-xs text-muted-foreground">{c.evaluation_notes}</p>
              )}

              {dispute.status === "RANKED" && c.claimant?.toLowerCase() === address?.toLowerCase() && (
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Additional provenance URL (own claim only)"
                    value={challengeUrlByClaim[c.claim_id] || ""}
                    onChange={(e) =>
                      setChallengeUrlByClaim((prev) => ({ ...prev, [c.claim_id]: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={busy === `challenge-${c.claim_id}` || !contract}
                    onClick={() =>
                      withBusyState(`challenge-${c.claim_id}`, async () => {
                        await contract!.submitChallengeEvidence(c.claim_id, challengeUrlByClaim[c.claim_id] || "");
                      })
                    }
                  >
                    Submit
                  </Button>
                </div>
              )}

              {c.claimant?.toLowerCase() === address?.toLowerCase() &&
                (c.status === "WINNER" || c.status === "REFUNDED") && (
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={busy === `withdraw-${c.claim_id}` || !contract}
                    onClick={() => withBusyState(`withdraw-${c.claim_id}`, async () => {
                      await contract!.withdraw(c.claim_id);
                    })}
                  >
                    {busy === `withdraw-${c.claim_id}` ? "WITHDRAWING…" : "WITHDRAW"}
                  </Button>
                )}
            </div>
          ))}
          {claims.length === 0 && <p className="text-sm text-muted-foreground">No claims filed yet.</p>}
        </div>
      </section>

      {canFileClaim && (
        <section className="space-y-3 rounded-md border border-border bg-card p-6">
          <h2 className="font-mono text-sm uppercase tracking-wide text-muted-foreground">File Your Claim</h2>
          <div className="space-y-1.5">
            <Label>Pinned artifact URL (immutable once filed)</Label>
            <Input value={artifactUrl} onChange={(e) => setArtifactUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Provenance type</Label>
              <select
                value={provenanceType}
                onChange={(e) => setProvenanceType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm"
              >
                {PROVENANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Provenance hint URL {provenanceType === "GIT_COMMIT" ? "(required)" : "(optional)"}</Label>
              <Input
                value={provenanceHintUrl}
                onChange={(e) => setProvenanceHintUrl(e.target.value)}
                placeholder={provenanceType === "GIT_COMMIT" ? "https://api.github.com/repos/owner/repo/commits/sha" : ""}
              />
            </div>
          </div>
          <Button
            disabled={busy === "file-claim" || !contract || !artifactUrl}
            onClick={() =>
              withBusyState("file-claim", async () => {
                await contract!.fileClaim(
                  dispute.dispute_id,
                  artifactUrl.trim(),
                  provenanceType,
                  provenanceHintUrl.trim(),
                  BigInt(dispute.required_stake_wei)
                );
              })
            }
            className="font-mono text-xs"
          >
            {busy === "file-claim" ? "SUBMITTING…" : `STAKE ${formatGen(dispute.required_stake_wei)} GEN & FILE CLAIM`}
          </Button>
        </section>
      )}

      <section className="flex flex-wrap gap-3">
        {canTriggerEval && (
          <Button
            variant="secondary"
            disabled={busy === "trigger" || !contract}
            onClick={() => withBusyState("trigger", async () => {
              await contract!.triggerEvaluation(dispute.dispute_id);
            })}
            className="font-mono text-xs"
          >
            {busy === "trigger" ? "RUNNING VALIDATOR CONSENSUS…" : "TRIGGER EVALUATION"}
          </Button>
        )}
        {canFinalize && (
          <Button
            variant="secondary"
            disabled={busy === "finalize" || !contract}
            onClick={() => withBusyState("finalize", async () => {
              await contract!.finalizeDispute(dispute.dispute_id);
            })}
            className="font-mono text-xs"
          >
            {busy === "finalize" ? "FINALIZING…" : "FINALIZE (CLOSE CHALLENGE WINDOW)"}
          </Button>
        )}
      </section>
    </div>
  );
}
