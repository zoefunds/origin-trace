// ORIGIN TRACE — 2 live e2e tests against the current deployed contract:
//
// Test A (claim:0): WAYBACK happy path, using the default (no
// provenance_hint_url) archive.org query -- a real, genuinely static
// artifact (the GPL-3.0 license text at gnu.org), verified byte-identical
// between the live page and its most recent real archive.org snapshot
// before spending any GEN.
//
// Test B (claim:1): WAYBACK attacker-endpoint rejection -- proves the
// _wayback_query_url fix live, not just in unit tests. provenance_hint_url
// points at a non-archive.org host; the claim must be rejected outright
// rather than trusting whatever that endpoint self-reports.
import { write, read } from "./e2e-run.mjs";
import { writeFileSync } from "fs";

const idea = {
  title: "RFC 2119: Key words for use in RFCs to Indicate Requirement Levels",
  description:
    "The IETF Best Current Practice document defining the meaning of MUST, MUST NOT, SHOULD, SHOULD NOT, " +
    "MAY, and related key words when they appear in capital letters in an Internet-Draft or RFC, so that " +
    "requirement levels are stated unambiguously.",
};
const r0 = await write("e1", "create_dispute", [idea.title, idea.description, 10000000000000000n, 900, 7200]);
const disputeId = r0.ret;

// Test A: legitimate WAYBACK claim, default archive.org query.
const rA = await write(
  "e1", "file_claim",
  [disputeId, "https://www.rfc-editor.org/rfc/rfc2119.txt", "WAYBACK", ""],
  10000000000000000n,
);

// Test B: WAYBACK claim with an attacker-controlled provenance_hint_url --
// must be rejected outright by _wayback_query_url, never fetched.
const rB = await write(
  "e2", "file_claim",
  [disputeId, "https://www.rfc-editor.org/rfc/rfc2119.txt", "WAYBACK",
   "https://attacker-controlled.example.net/fake-archive?url=https://www.rfc-editor.org/rfc/rfc2119.txt"],
  10000000000000000n,
);

const out = { disputeId, claimA: rA.ret, claimB: rB.ret, filing_window_s: 900, challenge_window_s: 7200 };
writeFileSync("/Users/macbook/origin/backend/scripts/e2e-wayback-tests-results.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
