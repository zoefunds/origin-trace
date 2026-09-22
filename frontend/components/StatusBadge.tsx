const CLASS_BY_STATUS: Record<string, string> = {
  FILING_OPEN: "badge-filing-open",
  VALIDATING: "badge-validating",
  RANKED: "badge-ranked",
  CHALLENGE_WINDOW: "badge-challenge-window",
  FINALIZED: "badge-finalized",
  INCONCLUSIVE: "badge-inconclusive",
  CANCELLED: "badge-cancelled",
  TIMED_OUT: "badge-timed-out",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = CLASS_BY_STATUS[status] || "badge-inconclusive";
  return <span className={`badge-lifecycle ${cls}`}>{status.replace(/_/g, " ")}</span>;
}
