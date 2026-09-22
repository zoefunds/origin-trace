"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getActivityForAddress } from "@/lib/api";
import { useWallet } from "@/lib/genlayer/WalletProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { formatGen, formatAddress } from "@/lib/format";

export default function ProfilePage() {
  const { address, isConnected } = useWallet();

  const { data, isLoading } = useQuery({
    queryKey: ["activity", address],
    queryFn: () => getActivityForAddress(address as string),
    enabled: Boolean(address),
    refetchInterval: 20_000,
  });

  if (!isConnected) {
    return <p className="text-muted-foreground">Connect your wallet to see your activity.</p>;
  }
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">My Activity</h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{formatAddress(address, 6)}</p>
      </div>

      <section className="space-y-3">
        <h2 className="font-mono text-sm uppercase tracking-wide text-muted-foreground">Disputes I Created</h2>
        <div className="space-y-2">
          {data?.created.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {data?.created.map((d) => (
            <Link
              key={d.dispute_id}
              href={`/dispute/${d.dispute_id}`}
              className="flex items-center justify-between rounded-md border border-border bg-card p-4 hover:border-[color:var(--boundary-strong)]"
            >
              <span className="text-sm font-medium">{d.idea_title}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-muted-foreground">{formatGen(d.stake_pool_deposited)} GEN</span>
                <StatusBadge status={d.status} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-sm uppercase tracking-wide text-muted-foreground">My Claims</h2>
        <div className="space-y-2">
          {data?.claims.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
          {data?.claims.map((c) => (
            <Link
              key={c.claim_id}
              href={`/dispute/${c.dispute_id}`}
              className="flex items-center justify-between rounded-md border border-border bg-card p-4 hover:border-[color:var(--boundary-strong)]"
            >
              <span className="truncate text-sm">{c.artifact_url}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-muted-foreground">{formatGen(c.stake_deposited)} GEN</span>
                <span className="badge-lifecycle badge-inconclusive">{c.status}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
