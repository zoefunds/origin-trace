# Origin Trace Review — Resubmission 3

## Review scope

This review documents the remediation of the team's third-round feedback on `review2.md`'s resubmission:

> The requested platform provenance binding is still incomplete: the contract only checks that the claimant-selected metadata URL shares a host or subdomain with the artifact, then accepts that endpoint's own URL, digest, and timestamp fields without proving it is an authoritative platform record. Since the resubmission does not fully resolve the previous request, we cannot proceed with it in its current form.

The reviewed implementation is `contracts/origin_trace.py`. The `PLATFORM_PUBLISH` fix described below first went live at `0x7efe5A21aa5Bf424D70A518fbdD2B2903399CDb1` (superseding `0x9289Fcb6e701a32EaeEd8f4D77Bc01f3920404D7` from `review2.md`), and the code described here is unchanged since — it is still exactly what is live at the **current** contract address:

```text
0xAb31625932b8eff4705a8F5bEBF0a51e81343d15
```

(The contract has been redeployed a further time since this fix landed, for reasons unrelated to `PLATFORM_PUBLISH`; this document covers only the platform-provenance-binding fix and its verification, not anything else that has changed since.)

## What was actually wrong

The team's critique was precise and correct, and identified two separate, compounding problems in `_evaluate_single_claim`'s `PLATFORM_PUBLISH` path (via `_same_host` and `_validate_platform_provenance_binding`):

1. **Same-host is not proof of authority.** `_same_host(provenance_hint_url, artifact_url)` only checked that the claimant-chosen metadata endpoint shared a hostname (or was a subdomain) with the artifact. Many real hosting arrangements let an ordinary user publish content *on that exact same host* that is just as claimant-controlled as the artifact itself — a user profile page, a gist, a wiki page, a comment, a personal subdomain on a shared platform. Sharing a host proves nothing about who operates that specific endpoint.

2. **Self-declared binding fields were trusted at face value.** `_validate_platform_provenance_binding` read `artifact_url`/`content_sha256` *directly out of the fetched endpoint's own JSON response* and compared them to the real artifact — i.e. it asked the endpoint "is this you?" and believed whatever it said. This provided **zero security value**: the artifact's digest is public information (anyone can compute it by fetching the artifact), so an attacker restating the correct digest in their own self-hosted JSON costs them nothing and proves nothing. Combined with (1), a claimant could stand up a JSON file anywhere on a domain they controlled, correctly self-report the real artifact's URL and digest, invent any timestamp they liked, and the contract would accept it as "the hosting platform's own reported metadata."

## Fix: stop trying to generically verify "authority", scope PLATFORM_PUBLISH to specific known-authoritative APIs instead

There is no generic, deterministic way to verify from a URL alone whether an arbitrary claimant-chosen endpoint is "the platform's own record" versus "a page the claimant themselves controls on that platform." Any heuristic (path shape, `/api/` prefix, response headers) is gameable by a claimant hosting content that mimics the heuristic. The only sound approach is the one this contract's `GIT_COMMIT` adapter has used from the start: **narrow to a small, explicit set of known platforms with a genuinely third-party-operated, unauthenticated, structured metadata API**, and **derive the endpoint URL deterministically from `artifact_url` — never accept a claimant-supplied endpoint at all.**

`PLATFORM_PUBLISH` is now scoped to **Hacker News items**. Design:

- `_hn_api_url(artifact_url)` recognizes `https://news.ycombinator.com/item?id=<id>` and derives `https://hacker-news.firebaseio.com/v0/item/<id>.json` from the `id` query parameter — this is the *only* endpoint that will ever be fetched for a given artifact; there is no `provenance_hint_url` for this type anymore, so there is no "which endpoint counts as authoritative" question left to answer. `file_claim` now rejects a non-Hacker-News `artifact_url` outright, before any stake is accepted.
- `_extract_platform_publish_timestamp` fetches that derived URL and uses **Hacker News' own reported `id` and `time` fields** — never a self-declared "this is the artifact you're looking for" claim. `id` is compared against the `id` embedded in `artifact_url` itself (which the claimant cannot forge without changing what artifact is pinned), and `time` is Hacker News' own server-assigned Unix timestamp, which the post's author can never edit after the fact.
- The whole path is now **fully deterministic — no LLM anywhere**, unlike the prior design's LLM-based scrape of "wildly inconsistent unstructured metadata." Leader and validator now re-derive byte-identical results for `PLATFORM_PUBLISH` exactly like `WAYBACK`/`GIT_COMMIT` already did; `_results_agree`'s timestamp tolerance is now a generous ceiling against incidental skew rather than cover for genuine LLM nondeterminism.

### Why not Reddit?

The initial implementation of this fix targeted Reddit's public `.json` API (append `.json` to any post permalink, read the post's own `created_utc`/`permalink` fields) — architecturally identical to the Hacker News design below. It was verified working via manual `curl` testing, then discovered to reliably return `HTTP 403` for unauthenticated/automated requests before any GEN was spent deploying it — Reddit has tightened anti-bot enforcement on that endpoint, which would have made every `PLATFORM_PUBLISH` claim permanently unverifiable for GenVM's validators (their requests would face the same block, likely worse, coming from datacenter IPs). Hacker News' Firebase-backed API was verified reachable and stable (checked repeatedly, no blocking) before committing to it.

## Regression tests (`tests/direct/test_origin_trace_lifecycle.py`, 25 → 27)

The old `test_platform_publish_rejects_claimant_controlled_metadata_endpoint` test (which validated the now-removed same-host + self-declared-binding design) was replaced with three tests against the new design, each verified to **fail against the pre-fix code and pass against the fix**:

1. `test_platform_publish_rejects_non_hn_artifact_url_at_filing` — a `PLATFORM_PUBLISH` claim on a self-hosted domain is rejected outright at `file_claim`, before any stake is accepted — there is no endpoint left for a claimant to choose, so this closes the hole structurally rather than by heuristic.
2. `test_platform_publish_hn_item_resolves_deterministically` — a real-shaped Hacker News API response resolves the claim using HN's own `time`/`id` fields, no LLM call for the timestamp, and the claim wins a real two-claim race.
3. `test_platform_publish_rejects_hn_response_for_a_different_item` — if the derived endpoint's response describes a different item than the one pinned, the claim is rejected via HN's own `id` field mismatch, not silently accepted because the host matched.

```
pytest tests/direct/ -v
============================== 27 passed in 1.31s ==============================
```

`genvm-lint check contracts/origin_trace.py` — `✓ Lint passed (3 checks)`, `✓ Validation passed`, 14 methods (5 view, 9 write), 0 errors.

## Redeployment and live verification

This fix first went live at `0x7efe5A21aa5Bf424D70A518fbdD2B2903399CDb1` (backend/frontend rewired, a tracked one-time reset migration `004_reset_for_platform_publish_redesign.sql` shipped through the same pattern established in `review2.md`). The live verification below was completed against the **current** contract, `0xAb31625932b8eff4705a8F5bEBF0a51e81343d15` — a later redeploy for unrelated reasons carried this exact, unchanged `PLATFORM_PUBLISH` code forward, and re-running the proof there (rather than leaving it against an address that's no longer current) keeps this document accurate to what's actually live today.

This is also the **first live on-chain exercise of `PLATFORM_PUBLISH`** in this project (previous live testing only covered `GIT_COMMIT` and `cancel_dispute`, a gap explicitly flagged in `review2.md`). A real dispute was filed pairing a real Hacker News item (id `8863`, "My YC app: Dropbox — Throw away your USB drive", real `time: 1175714200` / 2007-04-05, verified reachable and stable via `curl` before spending any GEN) against a `GIT_COMMIT` claim on an unrelated real GitHub repo, to confirm the new adapter resolves a genuine claim end to end on real consensus infrastructure, not just against mocks.

**Result, real GenLayer validator consensus, `dispute:0`:**

```json
{
  "dispute_id": "dispute:0",
  "status": "RANKED",
  "leading_claim_id": "claim:0",
  "ranking_verdict": "RANKED_WINNER",
  "ranking_rationale": "Exactly one claim (claim:0) had a verified timestamp and a substantive match above threshold; it wins by default eligibility."
}
```

- `claim:0` (`PLATFORM_PUBLISH`, `https://news.ycombinator.com/item?id=8863`): `timestamp_verified: true`, **`estimated_earliest_ts: 1175714200`** — this is an EXACT match to the real Hacker News `time` field independently fetched by hand via `curl` before any GEN was spent (2007-04-05T16:16:40Z), now independently re-derived by 5 GenLayer validators reaching consensus on the identical value. `match_score_bps: 9800` — the model correctly matched the post's real title and the `getdropbox.com/u/2/screencast.html` URL embedded in Hacker News' own API response against the disputed idea's "screencast demo" framing.
- `claim:1` (`GIT_COMMIT`, an unrelated GitHub repo, included only to satisfy the 2-claim minimum): correctly scored `match_score_bps: 0` (no substantive relation to the Dropbox idea) and separately failed its own digest check — irrelevant to this test's purpose, since it was never intended to win.

This is real, end-to-end, on-chain proof that the redesigned `PLATFORM_PUBLISH` adapter — Hacker News' own server-assigned `id`/`time` fields, derived endpoint, no claimant-suppliable provenance URL, no LLM in the timestamp path — resolves a genuine claim correctly through actual GenLayer consensus, not just against mocks.

**Full lifecycle completed** after the 2-hour challenge window closed (no challenge evidence submitted, so `finalize_dispute` was a purely deterministic step over the already-agreed ranking):

```json
{
  "dispute_id": "dispute:0",
  "status": "FINALIZED",
  "final_winner_claim_id": "claim:0",
  "finalized_ts": 1790794475,
  "stake_pool_deposited": "0"
}
```

`claim:0` reached `status: "WINNER"`; `withdraw()` (called by its claimant, `e1`) succeeded (`tx: ACCEPTED`) and paid out the full 0.03 GEN stake pool, zeroing `stake_pool_deposited`. `claim:1` reached `status: "LOSER"`. This closes the loop: a real `PLATFORM_PUBLISH` claim, backed by a real third-party-operated API, independently verified by GenLayer's validator consensus, ranked, finalized, and paid out — with zero manual intervention in the ranking or payout logic. Independently re-checkable via `get_dispute("dispute:0")` / `get_claim("claim:0")` / `get_claim("claim:1")` against the live contract.
