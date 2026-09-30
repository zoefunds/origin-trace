// ORIGIN TRACE — finalize + withdraw for the Test 1 retry dispute, once
// its 2h challenge window has elapsed. No challenge evidence was
// submitted, so finalize_dispute is a purely deterministic step over the
// already-agreed preliminary ranking (claim:3, Spoon-Knife, the only
// claim with both a verified timestamp and a substantive match above
// threshold).
import { write, read } from "./e2e-run.mjs";
import { readFileSync, writeFileSync } from "fs";

const prior = JSON.parse(readFileSync("/Users/macbook/origin/backend/scripts/e2e-retry-test1-results.json", "utf8"));
const { disputeId, claimA, claimB } = prior;

const rFinalize = await write("e1", "finalize_dispute", [disputeId], 0n, 300, 5000);
const dispute = await read("get_dispute", [disputeId]);
const finalClaimA = await read("get_claim", [claimA]);
const finalClaimB = await read("get_claim", [claimB]);

const winnerClaimId = finalClaimB.status === "WINNER" ? claimB : claimA;
const winnerSigner = winnerClaimId === claimB ? "e2" : "e1";
const rWithdraw = await write(winnerSigner, "withdraw", [winnerClaimId], 0n, 300, 5000);
const disputeAfterWithdraw = await read("get_dispute", [disputeId]);

const out = {
  disputeId, finalize_status: rFinalize.status, dispute,
  claimA: finalClaimA, claimB: finalClaimB,
  winnerClaimId, withdraw_status: rWithdraw.status,
  dispute_after_withdraw: disputeAfterWithdraw,
};
writeFileSync("/Users/macbook/origin/backend/scripts/e2e-retry-test1-phase3-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
