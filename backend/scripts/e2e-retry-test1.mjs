// ORIGIN TRACE — clean retry of Test 1, after dispute:0 resolved
// INCONCLUSIVE due to (a) Spoon-Knife's default branch having genuinely
// changed from "master" to "main" upstream (a 404 on the live raw fetch,
// confirmed via `curl -sL`, not a contract bug) and (b) an apparent
// transient GitHub-side hiccup on the Hello-World raw fetch (byte-verified
// identical with -L moments before and after this run). Both re-verified
// clean immediately before this run.
import { write, read } from "./e2e-run.mjs";
import { writeFileSync } from "fs";

const idea = {
  title: "GitHub's canonical fork/clone teaching-demo repository (retry)",
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
  [disputeId, "https://github.com/octocat/Spoon-Knife/blob/main/index.html", "GIT_COMMIT",
   "https://api.github.com/repos/octocat/Spoon-Knife/commits/a30c19e3f13765a3b48829788bc1cb8b4e95cee4"],
  20000000000000000n,
);

const out = { disputeId, claimA: rA.ret, claimB: rB.ret, filing_window_s: 900, challenge_window_s: 7200 };
writeFileSync("/Users/macbook/origin/backend/scripts/e2e-retry-test1-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
