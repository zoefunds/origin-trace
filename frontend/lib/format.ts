export function formatAddress(address: string | null | undefined, len = 4): string {
  if (!address) return "";
  if (address.length <= len * 2 + 2) return address;
  return `${address.slice(0, len + 2)}...${address.slice(-len)}`;
}

export function formatGen(wei: string | bigint, decimals = 4): string {
  const value = typeof wei === "string" ? BigInt(wei || "0") : wei;
  const whole = value / 10n ** 18n;
  const frac = value % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, decimals);
  return `${whole.toString()}.${fracStr}`;
}

export function formatUnixTs(ts: number): string {
  if (!ts) return "--";
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCountdown(targetTs: number, nowTs = Date.now() / 1000): string {
  const diff = Math.floor(targetTs - nowTs);
  if (diff <= 0) return "closed";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
