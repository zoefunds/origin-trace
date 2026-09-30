// ORIGIN TRACE — live e2e phase 2: trigger_evaluation once the 15-min
// filing window has closed. Evaluation involves 5 validators each
// independently fetching GitHub live and re-deriving a result -- this can
// legitimately take several minutes (confirmed earlier this session: one
// run resolved MAJORITY_AGREE after ~15 min), so this uses a much larger
// retry budget than the simple create/file/cancel calls.
import { write, read } from "./e2e-run.mjs";
import { readFileSync, writeFileSync } from "fs";

const prior = JSON.parse(readFileSync("/Users/macbook/origin/backend/scripts/e2e-run-results.json", "utf8"));
const { disputeId } = prior.test1;

const rEval = await write("e1", "trigger_evaluation", [disputeId], 0n, 300, 5000); // up to 25 min
const dispute = await read("get_dispute", [disputeId]);

const out = { disputeId, trigger_status: rEval.status, post_evaluation: dispute };
writeFileSync("/Users/macbook/origin/backend/scripts/e2e-run-phase2-results.json", JSON.stringify(out, null, 2));
console.log("PHASE 2 (trigger_evaluation) COMPLETE");
console.log(JSON.stringify(out, null, 2));
