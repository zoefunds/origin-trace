# Origin Trace Review

## Review scope

This review documents the remediation of the team’s request:

> The contract must bind provenance timestamps to the claimed artifact so unrelated historical evidence cannot determine the escrow winner. Provenance must be derived or validated against the artifact’s canonical identity and immutable content before ranking.

The reviewed implementation is `contracts/origin_trace.py`, deployed to GenLayer StudioNet at:

```text
0x6B3321b0d92E614abC11dA7D241a8918879DcEe1
```

The live integrations are:

| Component | Current deployment |
|---|---|
| Contract | GenLayer StudioNet, address above |
| Backend | Fly.io `origin-trace-backend-starlit-sound-5755` |
| Backend URL | https://origin-trace-backend-starlit-sound-5755.fly.dev |
| Frontend | Vercel project `origin-trace` |
| Frontend URL | https://origin-trace-wine.vercel.app |

## Original weakness

The earlier implementation could accept an independently fetched historical timestamp without proving that the historical record represented the exact artifact being ranked. That created two related risks:

1. A claimant could point at an unrelated archive record or commit with an earlier timestamp.
2. A record could identify the right URL or repository while representing different content than the artifact whose substantive match score was being ranked.

The timestamp itself was therefore not sufficient evidence of priority.

## Remediation implemented

### Canonical artifact identity

`_canonical_artifact_identity()` normalizes the artifact URL by:

- lowercasing the scheme and host;
- removing query strings and fragments;
- normalizing repeated slashes;
- normalizing the empty path to `/`.

`_same_artifact_identity()` is used before a provenance timestamp can be accepted.

### Immutable content digest

Every evaluation fetches the pinned artifact and computes a SHA-256 digest of the exact content used for substantive matching. The digest is carried in the structured nondeterministic result and is required to agree between leader and validators.

If validators fetch different artifact content, `_results_agree()` returns false immediately. The ranking function therefore cannot proceed from inconsistent artifact material.

### Wayback provenance

The Wayback adapter now requires all of the following:

1. The archive response must identify an available snapshot.
2. The snapshot URL/original URL must match the pinned artifact’s canonical identity.
3. The archived snapshot content is fetched independently.
4. The archived content digest must equal the digest of the pinned artifact.
5. Only then is the archive timestamp parsed and returned.

An archive record for another URL, or an archive snapshot whose content differs from the artifact, is rejected with an `[EXPECTED]` error and cannot determine the winner.

### Git provenance

The Git adapter now requires all of the following:

1. The commit API endpoint must belong to the repository containing the pinned artifact.
2. The artifact must contain a versioned file path, such as a GitHub `blob` URL.
3. The file is fetched at the claimed commit revision.
4. The file-at-commit digest must equal the pinned artifact digest.
5. Only then is the commit timestamp parsed.

An old commit from another repository, or a commit where the file content differs, is rejected before ranking.

### Platform publish provenance

`PLATFORM_PUBLISH` claims must provide a provenance URL. The response must contain structured metadata binding:

- an artifact URL whose canonical identity equals the pinned artifact; and
- a `content_sha256`/equivalent digest equal to the fetched artifact digest.

Only after those deterministic checks pass is the platform publish timestamp extracted. Arbitrary HTML, unrelated platform pages, and metadata with a mismatched digest are ineligible.

### Challenge evidence

Challenge evidence remains additive-only. A claimant can add provenance for its own already-pinned artifact, but cannot replace the artifact. Every added Wayback, Git, or platform source goes through the same identity and content-binding checks.

## Test verification

The direct lifecycle suite passed completely:

```text
20 passed
```

The suite covers winner/refund lifecycles, near ties, missing provenance, adversarial artifact text, mismatched artifact identity, challenge-window rules, access control, timeout behavior, deterministic Git parsing, and the content-binding regression paths.

## Live E2E verification

The previous contract engagement cache was cleared before the new-contract run:

- 3 old disputes removed from Fly Postgres;
- 3 old claims removed;
- poller cursor reset to zero.

Two live scenarios were then run against the final contract.

### Scenario 1 — unfunded cancellation

1. Created an unfunded dispute titled `Cancellation E2E final contract`.
2. Cancelled it before any claims were filed.
3. Both writes reached consensus successfully.

This verified the creator cancellation path without invoking owner/admin methods.

### Scenario 2 — funded two-party escrow

Created dispute `dispute:1` with:

- title: `Final contract two-party provenance E2E`;
- detailed artifact-identity/content-binding description;
- required stake: `0.01 GEN`;
- filing window: 900 seconds;
- challenge window: 7200 seconds.

Two payable claims were accepted:

- `claim:0`: `https://example.com/origin-trace-e2e-a`;
- `claim:1`: `https://example.com/origin-trace-e2e-b`;
- total escrow pool: `0.02 GEN`.

The following additional writes were exercised:

- `trigger_evaluation` before the filing deadline;
- `submit_challenge_evidence` before the filing deadline;
- `cancel_dispute` after claims existed;
- `finalize_dispute` before evaluation was ready;
- `withdraw` before the claim was withdrawable;
- `claim_dispute_timeout` before the timeout elapsed.

The contract returned the expected protections, including:

```text
[EXPECTED] Cannot cancel after a claim was filed
[EXPECTED] Dispute is not ready to finalize
[EXPECTED] Claim is not in a withdrawable state
[EXPECTED] Evaluation timeout has not yet passed
```

These are deadline/state rejections, not test failures. The funded dispute is intentionally still `FILING_OPEN` until its real filing deadline closes.

## Frontend/backend verification

The Fly backend was updated with the final contract address and restarted. Its health endpoint returned:

```json
{"ok":true,"service":"origin-trace-backend"}
```

The poller synced the new dispute from the final contract. The frontend-facing API returned:

- `dispute_id`: `dispute:1`;
- `status`: `FILING_OPEN`;
- `claim_count`: `2`;
- `stake_pool_deposited`: `20000000000000000` wei;
- `last_synced_at`: refreshed after the restart.

The production frontend was rebuilt with the same final contract address.

## Stale data cleanup

Repository documentation and environment examples now reference only the final contract address. The old contract addresses and old test counts were removed from the active README, deployment guide, memory record, and environment examples. No Cloudflare backend references remain in the audited documentation.

The database cleanup was limited to the backend’s cached index tables (`disputes`, `claims`, and `sync_state`). It did not modify the GenLayer contract, unrelated Fly applications, or unrelated infrastructure.

## Conclusion

The team’s requested property is now enforced before ranking: provenance must identify the same canonical artifact and prove content equivalence through SHA-256 validation. Unrelated historical evidence cannot supply an eligible timestamp and therefore cannot determine the escrow winner.
