import { write, read } from "./e2e-run.mjs";
import { readFileSync, writeFileSync } from "fs";

const prior = JSON.parse(readFileSync("/Users/macbook/origin/backend/scripts/e2e-retry-test1-results.json", "utf8"));
const { disputeId } = prior;

const rEval = await write("e1", "trigger_evaluation", [disputeId], 0n, 300, 5000);
const dispute = await read("get_dispute", [disputeId]);
const claimA = await read("get_claim", [prior.claimA]);
const claimB = await read("get_claim", [prior.claimB]);

const out = { disputeId, trigger_status: rEval.status, dispute, claimA, claimB };
writeFileSync("/Users/macbook/origin/backend/scripts/e2e-retry-test1-phase2-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
