// ORIGIN TRACE — live e2e run against the current contract, 2 scenarios
// (scoped down from 4 per instruction). Uses the same throwaway signer
// accounts and real GitHub artifacts verified earlier in this session.
//
// Test 1: full winner lifecycle -- create_dispute, file_claim x2 (payable,
// two real GIT_COMMIT claims at genuinely different real historical
// commits), trigger_evaluation, finalize_dispute, withdraw. Covers the
// core "earliest verifiable + substantively matching claim wins" loop.
// Test 2: cancel_dispute -- create_dispute, cancel_dispute (creator, no
// claims filed). Fast, no time-gate, distinct write path.
import { Wallet } from "/opt/homebrew/lib/node_modules/genlayer/node_modules/ethers/lib.commonjs/index.js";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { readFileSync, writeFileSync } from "fs";

export const CONTRACT = "0x9289Fcb6e701a32EaeEd8f4D77Bc01f3920404D7";
export const ENDPOINT = "https://studio.genlayer.com/api";
const chain = { ...studionet, rpcUrls: { default: { http: [ENDPOINT] } } };

// Passwords for the throwaway keystores at ~/.genlayer/keystores/ come from
// the environment, never hardcoded here -- keep them out of git even for
// low-value testnet signers.
export const SIGNERS = {
  e1: { keystore: "origin-trace-e2e-1", password: process.env.E2E_SIGNER_PW_1 },
  e2: { keystore: "origin-trace-e2e-2", password: process.env.E2E_SIGNER_PW_2 },
  e3: { keystore: "origin-trace-e2e-3", password: process.env.E2E_SIGNER_PW_3 },
};

const clients = {};
export async function clientFor(who) {
  if (clients[who]) return clients[who];
  const { keystore, password } = SIGNERS[who];
  const json = readFileSync(`/Users/macbook/.genlayer/keystores/${keystore}.json`, "utf8");
  const wallet = await Wallet.fromEncryptedJson(json, password);
  const client = createClient({ chain, endpoint: ENDPOINT, account: createAccount(wallet.privateKey) });
  clients[who] = client;
  return client;
}

export async function write(who, method, args, value = 0n, retries = 150, interval = 5000) {
  const client = await clientFor(who);
  const hash = await client.writeContract({ address: CONTRACT, functionName: method, args, value });
  const receipt = await client.waitForTransactionReceipt({ hash, retries, interval });
  const status = receipt.status_name ?? receipt.status;
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  const execResult = leader?.execution_result;
  const resultStatus = leader?.result?.status;
  const readable = leader?.result?.payload?.readable;
  let ret = null;
  if (readable !== undefined) {
    try { ret = JSON.parse(readable); } catch { ret = readable; }
  }
  const argsStr = JSON.stringify(args, (k, v) => (typeof v === "bigint" ? v.toString() : v));
  console.log(`[write] ${who}.${method}(${argsStr}) value=${value} -> tx=${status} exec=${execResult} result=${resultStatus} hash=${hash} ret=${JSON.stringify(ret)}`);
  // A "SUCCESS"/"return" leader receipt only means the LEADER's own
  // execution succeeded -- it says nothing about whether consensus was
  // actually reached. The overall tx status is the only thing that tells
  // us whether the state change actually committed; ACCEPTED/FINALIZED are
  // the only committed-success states, UNDETERMINED means consensus could
  // not be reached (state unchanged, safe to retry) just like
  // MAJORITY_DISAGREE.
  if (status !== "ACCEPTED" && status !== "FINALIZED") {
    const payload = leader?.result?.payload;
    throw new Error(`${method} did not reach consensus: tx=${status} exec=${execResult} result=${resultStatus} payload=${JSON.stringify(payload)}`);
  }
  if (execResult !== "SUCCESS" || resultStatus !== "return") {
    const payload = leader?.result?.payload;
    throw new Error(`${method} did not succeed: exec=${execResult} result=${resultStatus} payload=${JSON.stringify(payload)}`);
  }
  return { hash, receipt, status, ret };
}

export async function read(method, args = []) {
  const client = await clientFor("e1");
  const raw = await client.readContract({ address: CONTRACT, functionName: method, args });
  try { return JSON.parse(raw); } catch { return raw; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = {};

  // ---------------------------------------------------------------------
  // Test 1: full winner lifecycle, real GitHub history --
  //   - octocat/Hello-World README @ 7fd1a60b (2012-03-06) -- earlier
  //   - octocat/Spoon-Knife index.html @ a30c19e3 (2014-02-12) -- later
  // Both verified by hand earlier this session: live content at
  // /blob/master/<path> byte-matches the raw content at that exact commit.
  // ---------------------------------------------------------------------
  {
    const idea = {
      title: "GitHub's canonical fork/clone teaching-demo repository",
      description:
        "A minimal, intentionally trivial example repository published by GitHub itself and used to teach " +
        "first-time users the basic fork -> clone -> edit -> push workflow, distinct from any real application " +
        "code -- the content is deliberately a placeholder greeting or fork-prompt, not functional software.",
    };
    const r0 = await write("e1", "create_dispute", [idea.title, idea.description, 20000000000000000n, 900, 7200]);
    const disputeId = r0.ret;

    const rA = await write(
      "e1", "file_claim",
      [disputeId, "https://github.com/octocat/Hello-World/blob/master/README", "GIT_COMMIT",
       "https://api.github.com/repos/octocat/Hello-World/commits/7fd1a60b01f91b314f59955a4e4d4e80d8edf11"],
      20000000000000000n,
    );
    const rB = await write(
      "e2", "file_claim",
      [disputeId, "https://github.com/octocat/Spoon-Knife/blob/master/index.html", "GIT_COMMIT",
       "https://api.github.com/repos/octocat/Spoon-Knife/commits/a30c19e3f13765a3b48829788bc1cb8b4e95cee4"],
      20000000000000000n,
    );
    results.test1 = { disputeId, claimA: rA.ret, claimB: rB.ret, filing_window_s: 900, challenge_window_s: 7200 };
  }

  // ---------------------------------------------------------------------
  // Test 2: creator cancels before any claim is filed. No time gate.
  // ---------------------------------------------------------------------
  {
    const idea = {
      title: "Streaming dictionary compression for rollup batch data",
      description:
        "A method for compressing rollup batch data using streaming dictionaries rebuilt incrementally over a " +
        "rolling window of prior transactions, reducing L1 data-availability costs without a trusted setup.",
    };
    const r0 = await write("e3", "create_dispute", [idea.title, idea.description, 10000000000000000n, 900, 7200]);
    const disputeId = r0.ret;
    const rCancel = await write("e3", "cancel_dispute", [disputeId]);
    const dispute = await read("get_dispute", [disputeId]);
    results.test2 = { disputeId, cancel_status: rCancel.status, final_status: dispute };
  }

  writeFileSync("/Users/macbook/origin/backend/scripts/e2e-run-results.json", JSON.stringify(results, null, 2));
  console.log("PHASE 1 (create/file/cancel) COMPLETE");
  console.log(JSON.stringify(results, null, 2));
}
