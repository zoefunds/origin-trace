import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { KeychainManager } from "/opt/homebrew/lib/node_modules/genlayer/src/lib/config/KeychainManager.ts";

const address = "0x6B3321b0d92E614abC11dA7D241a8918879DcEe1" as `0x${string}`;
const endpoint = "https://studio.genlayer.com/api";
const chain = { ...studionet, rpcUrls: { default: { http: [endpoint] } } };
const keychain = new KeychainManager();

async function clientFor(name: string) {
  const key = await keychain.getPrivateKey(name);
  if (!key) throw new Error(`Unlocked key not available: ${name}`);
  return createClient({ chain, endpoint, account: createAccount(key) });
}

async function write(name: string, method: string, args: unknown[], value = 0n) {
  const client = await clientFor(name);
  const hash = await client.writeContract({ address, functionName: method, args, value } as any);
  const receipt = await client.waitForTransactionReceipt({ hash, retries: 100, interval: 5000 });
  console.log(JSON.stringify({ name, method, hash, status: (receipt as any).status_name ?? (receipt as any).status }));
  return { client, hash, receipt };
}

// Scenario 2: funded two-party dispute. This covers every non-admin write
// path that can be reached without waiting for the 15-minute filing deadline:
// create_dispute, file_claim (payable, two wallets), trigger_evaluation,
// submit_challenge_evidence, plus expected deadline/state rejections for
// finalize_dispute, withdraw, and claim_dispute_timeout.
await write("promise-war-e2e", "create_dispute", [
  "Final contract two-party provenance E2E",
  "A detailed live test of artifact identity, immutable content binding, challenge evidence, and escrow lifecycle.",
  10_000_000_000_000_000n, 900, 7200,
]);
await write("promise-war-e2e", "file_claim", [
  "dispute:1", "https://example.com/origin-trace-e2e-a", "WAYBACK", "",
], 10_000_000_000_000_000n);
await write("dv-buyer", "file_claim", [
  "dispute:1", "https://example.com/origin-trace-e2e-b", "WAYBACK", "https://archive.org/wayback/available?url=https://example.com/origin-trace-e2e-b",
], 10_000_000_000_000_000n);
await write("promise-war-e2e", "trigger_evaluation", ["dispute:1"]);
await write("dv-buyer", "submit_challenge_evidence", ["claim:1", "https://archive.org/wayback/available?url=https://example.com/origin-trace-e2e-b"]);
for (const [name, method, args] of [
  ["promise-war-e2e", "finalize_dispute", ["dispute:1"]],
  ["promise-war-e2e", "withdraw", ["claim:0"]],
  ["promise-war-e2e", "claim_dispute_timeout", ["dispute:1"]],
] as const) {
  try { await write(name, method, args); } catch (error) { console.log(JSON.stringify({ name, method, expected_rejection: String(error) })); }
}
