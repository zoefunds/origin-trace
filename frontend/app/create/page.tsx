"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import OriginTraceContract, { genToWei } from "@/lib/contracts/OriginTrace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL;

const FILING_WINDOW_OPTIONS = [
  { label: "24 hours", seconds: 60 * 60 * 24 },
  { label: "48 hours (default)", seconds: 60 * 60 * 48 },
  { label: "7 days", seconds: 60 * 60 * 24 * 7 },
];

const CHALLENGE_WINDOW_OPTIONS = [
  { label: "6 hours", seconds: 60 * 60 * 6 },
  { label: "24 hours (default)", seconds: 60 * 60 * 24 },
  { label: "3 days", seconds: 60 * 60 * 24 * 3 },
];

export default function CreateDisputePage() {
  const router = useRouter();
  const { address, isConnected, isOnCorrectNetwork } = useWallet();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stakeGen, setStakeGen] = useState("1");
  const [filingSeconds, setFilingSeconds] = useState(FILING_WINDOW_OPTIONS[1].seconds);
  const [challengeSeconds, setChallengeSeconds] = useState(CHALLENGE_WINDOW_OPTIONS[1].seconds);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!isConnected || !address) {
      setErrorMsg("Connect your wallet first.");
      return;
    }
    if (!CONTRACT_ADDRESS) {
      setErrorMsg("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured yet. Deploy the contract and set it in .env.local.");
      return;
    }
    if (title.trim().length === 0 || description.trim().length === 0) {
      setErrorMsg("Title and description are required.");
      return;
    }

    setSubmitting(true);
    try {
      const contract = new OriginTraceContract(CONTRACT_ADDRESS, address, RPC_URL);
      const receipt = await contract.createDispute(
        title.trim(),
        description.trim(),
        genToWei(stakeGen),
        filingSeconds,
        challengeSeconds
      );
      const disputeId = (receipt.payload as any)?.id ?? null;
      router.push(disputeId ? `/dispute/${disputeId}` : "/");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create dispute.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">File a Priority Dispute</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This opens a filing window during which any number of claimants can each pin one
          artifact and stake the required amount. Timing and substantive match are decided by
          independent GenLayer validators once the window closes — never by you or the platform.
        </p>
      </div>

      {!isOnCorrectNetwork && isConnected && (
        <Alert variant="destructive">
          <AlertDescription>Switch your wallet to GenLayer Studio before filing.</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5 rounded-md border border-border bg-card p-6">
        <div className="space-y-1.5">
          <Label htmlFor="title">Idea / work title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Describe the specific idea or mechanism being disputed</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={4000}
            required
            placeholder="Be specific — this is the rubric validators use to judge substantive match. Vague descriptions weaken every claim's ability to clear the match threshold."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="stake">Required stake per claim (GEN)</Label>
            <Input
              id="stake"
              type="number"
              min="0.000001"
              step="0.000001"
              value={stakeGen}
              onChange={(e) => setStakeGen(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filing">Filing window</Label>
            <select
              id="filing"
              value={filingSeconds}
              onChange={(e) => setFilingSeconds(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm"
            >
              {FILING_WINDOW_OPTIONS.map((o) => (
                <option key={o.seconds} value={o.seconds}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="challenge">Challenge window (after preliminary ranking)</Label>
          <select
            id="challenge"
            value={challengeSeconds}
            onChange={(e) => setChallengeSeconds(Number(e.target.value))}
            className="h-9 w-full rounded-md border border-input bg-input px-3 text-sm"
          >
            {CHALLENGE_WINDOW_OPTIONS.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {errorMsg && (
          <Alert variant="destructive">
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={submitting || !isConnected} className="w-full font-mono text-xs">
          {submitting ? "SUBMITTING TRANSACTION…" : "CREATE DISPUTE"}
        </Button>
      </form>
    </div>
  );
}
