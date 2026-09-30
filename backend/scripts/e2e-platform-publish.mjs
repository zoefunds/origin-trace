// ORIGIN TRACE — live e2e test specifically proving the redesigned
// PLATFORM_PUBLISH adapter (Hacker News item API) end to end. This is the
// exact class of live proof review3.md's earlier gap called out: unit
// tests existed for PLATFORM_PUBLISH but no real on-chain claim had
// exercised it. Uses a real, permanent, well-known HN item (id 8863,
// "My YC app: Dropbox - Throw away your USB drive", real time=1175714200,
// verified reachable and stable via curl before spending any GEN).
import { write, read } from "./e2e-run.mjs";
import { writeFileSync } from "fs";

const idea = {
  title: "Dropbox pitched as a screencast demo replacing USB drives",
  description:
    "An early pitch for a cloud file-syncing service, framed specifically as a screencast demo showing how " +
    "it replaces carrying a USB drive around -- a 'my YC app' style launch post on a startup community site, " +
    "not the product's own marketing site.",
};
const r0 = await write("e1", "create_dispute", [idea.title, idea.description, 15000000000000000n, 900, 7200]);
const disputeId = r0.ret;

const rA = await write(
  "e1", "file_claim",
  [disputeId, "https://news.ycombinator.com/item?id=8863", "PLATFORM_PUBLISH", ""],
  15000000000000000n,
);
const rB = await write(
  "e2", "file_claim",
  [disputeId, "https://github.com/octocat/Hello-World/blob/master/README", "GIT_COMMIT",
   "https://api.github.com/repos/octocat/Hello-World/commits/7fd1a60b01f91b314f59955a4e4d4e80d8edf11"],
  15000000000000000n,
);

const out = { disputeId, claimA: rA.ret, claimB: rB.ret, filing_window_s: 900, challenge_window_s: 7200 };
writeFileSync("/Users/macbook/origin/backend/scripts/e2e-platform-publish-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
