"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listDisputes } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { formatAddress, formatGen, formatCountdown } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const { data: disputes, isLoading } = useQuery({
    queryKey: ["disputes", "all"],
    queryFn: () => listDisputes(),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-14">
      <section className="space-y-5 py-10 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-secondary">
          Onchain priority-dispute resolution protocol
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Claim you made it first.
          <br />
          Let the public timeline decide.
        </h1>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground">
          Two or more parties stake GEN claiming priority over the same idea. Each claim pins
          one public artifact at filing time. GenLayer validators independently verify timing
          and substantive match against third-party provenance — never a self-reported date.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button asChild size="lg" className="font-mono text-xs">
            <Link href="/create">FILE A DISPUTE</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="font-mono text-xs">
            <Link href="#feed">VIEW LIVE DISPUTES</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ["FILING_OPEN", "Competing claims pinned to one artifact each"],
          ["VALIDATING", "Independent fetch + LLM match on every validator"],
          ["CHALLENGE_WINDOW", "Additive-only provenance, no artifact swaps"],
          ["FINALIZED", "Deterministic payout — pull-based withdrawal"],
        ].map(([status, desc]) => (
          <div key={status} className="rounded-md border border-border bg-card p-4">
            <StatusBadge status={status} />
            <p className="mt-3 text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </section>

      <section id="feed" className="space-y-4">
        <h2 className="font-mono text-sm uppercase tracking-wide text-muted-foreground">
          Live Dispute Feed
        </h2>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface-02)] text-left font-mono text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Idea</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Claims</th>
                <th className="px-4 py-3">Pool</th>
                <th className="px-4 py-3">Filing Closes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    Loading disputes…
                  </td>
                </tr>
              )}
              {!isLoading && disputes?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    No disputes filed yet. Be the first.
                  </td>
                </tr>
              )}
              {disputes?.map((d) => (
                <tr key={d.dispute_id} className="border-t border-border hover:bg-[color:var(--surface-01)]">
                  <td className="px-4 py-3">
                    <Link href={`/dispute/${d.dispute_id}`} className="font-medium hover:text-primary">
                      {d.idea_title}
                    </Link>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      by {formatAddress(d.creator)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3 font-mono">{d.claim_count}</td>
                  <td className="px-4 py-3 font-mono">{formatGen(d.stake_pool_deposited)} GEN</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {d.status === "FILING_OPEN" ? formatCountdown(d.filing_deadline_ts) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
