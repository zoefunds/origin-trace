# ORIGIN TRACE — Project Memory

Persistent source of truth for this project across sessions. Read this
first before making architectural decisions. Update it whenever a decision
or the live state changes — this file describes **current reality**, not a
session-by-session diary; stale entries get corrected in place, not left
alongside their replacement.

## What this project is

ORIGIN TRACE is an onchain priority-dispute resolution protocol on
GenLayer. Two or more parties each stake GEN claiming they made a specific
idea/design/work first. Each claim pins one artifact URL at filing time,
immutable afterward. GenLayer validators independently fetch every
claimant's artifact plus a third-party provenance source for it (never the
claimant's self-reported date), and a fully separate deterministic function
ranks claims and pays out from the resulting structured
`(timestamp, match_score)` data. Full product spec: the original master
prompt (`richtext_converted_to_markdown (2).md`) and the review rubric this
was built to score 5/5 against (`JUDGE.md`), both under
`/Users/macbook/Downloads/`.

## Repository location

**Everything lives in `/Users/macbook/origin`.** Do not build in
`/Users/macbook/review` — that directory holds an unrelated pre-existing
project (`proof-of-work`) that must not be touched or confused with this one.

## Current live state

| Piece | Value |
|---|---|
| Contract address | `0x6B3321b0d92E614abC11dA7D241a8918879DcEe1` (GenLayer StudioNet, deployed by the user) |
| Backend | https://origin-trace-backend-starlit-sound-5755.fly.dev (Fly.io app `origin-trace-backend-starlit-sound-5755`, region `iad`, org `personal`) |
| Backend DB | Dedicated Fly Postgres cluster attached to the app (`DATABASE_URL` auto-set as a Fly secret) |
| Backend cache | Fly-managed Upstash Redis `origin-trace-cache`, set via `fly secrets set REDIS_URL=...` |
| Frontend | https://origin-trace-wine.vercel.app (Vercel project `origin-trace`, scope `adebiyi2002gmailcoms-projects`) |
| GitHub repo | https://github.com/zoefunds/origin-trace (pushed as user `zoefunds`, no bot attribution) |

Both live services are confirmed wired to the real contract: `fly logs -a
origin-trace-backend-starlit-sound-5755` shows the poller successfully calling
`get_contract_info()` and cycling cleanly; the frontend renders correctly
in a real browser with the Reown wallet modal opening properly. See
`DEPLOY.md` for the full redeploy/verification/teardown reference.

Real secrets (`REDIS_URL`, `DATABASE_URL`, live `CONTRACT_ADDRESS` values)
live only in `backend/.env` / `frontend/.env.local` (both gitignored) and
in Fly/Vercel's own secret stores — never in git. `.env.example` files hold
placeholders only, except the Reown project ID (`d3d589c09ef32b5b3273da42abb75d5e`),
which is a public client-side identifier baked into every WalletConnect
request and is fine to commit.

## Locked architecture decisions

- **Backend datastore**: PostgreSQL (Fly Postgres in production, native/
  Docker locally).
- **Backend hosting**: Fly.io, 24/7 always-on (`min_machines_running=1`,
  `auto_stop_machines=false` — the "must never die" requirement).
- **Auth**: wallet-based (SIWE-style message signing via MetaMask/Rainbow/
  Zerion/WalletConnect through Reown AppKit). No custodied private keys, no
  email/password option.
- **Filing window**: 48h default (`DEFAULT_FILING_WINDOW_SECONDS`), bounded
  `[15min, 30 days]`.
- **Timestamp tolerance for INCONCLUSIVE**: 24h
  (`TIMESTAMP_TOLERANCE_SECONDS`).
- **Challenge window**: 24h fixed default
  (`DEFAULT_CHALLENGE_WINDOW_SECONDS`), configurable per-dispute at
  `create_dispute()` time within `[2h, 14 days]`.
- **Provenance scope**: generic from day one — `WAYBACK` (web archive),
  `GIT_COMMIT` (GitHub/GitLab commit API), `PLATFORM_PUBLISH` (LLM-extracted
  platform metadata) all supported, not narrowed to one type.
- **Contract deployment boundary**: deployments are performed through the
  authenticated GenLayer CLI account, with the resulting address recorded in
  this file, `README.md`, `DEPLOY.md`, and both `.env.example` files.
- **Frontend design system**: dark cryptographic-terminal aesthetic from
  `/Users/macbook/Documents/stitch_dark_theme_ui_design/DESIGN.md` —
  obsidian surfaces (`#090D14`/`#0D131F`/`#131B2B`/`#1B263B`), cyan primary
  (`#00F0FF`), teal secondary (`#00D2B4`), amber for challenge/timer states
  (`#FFB020`), Inter for prose, JetBrains Mono for hashes/timestamps/
  addresses/stake amounts. Non-pill badges only (2–4px radius) for
  lifecycle states.

## Contract

`contracts/origin_trace.py` — 1575 lines. `genvm-lint check` passes clean
(0 errors; 1 informational warning about a newer runner being available —
intentionally still pinned to
`py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` to match
the exact runner used by the reference projects below). Schema extraction
succeeds (14 methods, 0 ctor params). **20/20 direct-mode tests pass**
(`tests/direct/test_origin_trace_lifecycle.py`) — see the README's
"Contract" section for what's covered.

### Architecture lineage

Modeled directly on two prior GenLayer contracts that scored 560/480 points
after AI review: `Witness-Weaver` (`WitnessWeave` contract, at
`/Users/macbook/Witness-Weaver/contracts/witnessweave_contract.py`) and
`witnessmark` (`/Users/macbook/witnessmark/contracts/witnessmark_contract.py`).
Patterns reused directly:
- Single `_send_gen` escrow emission point; zero-ledger-then-transfer
  ordering everywhere money moves (reentrancy-safe by construction).
- `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` with the validator
  **independently re-deriving** the entire result (its own fetch, its own
  LLM call) rather than trusting the leader's output.
- Structured error classification (`[EXPECTED]`/`[EXTERNAL]`/`[TRANSIENT]`/
  `[LLM_ERROR]`) so leader/validator disagreement is meaningful instead of
  "any exception = disagree."
- Deterministic ranking/payout fully separated from the nondet evaluation
  step.

### Trust-boundary additions unique to this contract

- `WAYBACK`/`GIT_COMMIT` timestamp extraction is fully deterministic JSON
  parsing (no LLM at all), and the archived/file-at-commit content is hashed
  against the fetched artifact before the timestamp is eligible. Leaders and
  validators must match EXACTLY. Only `PLATFORM_PUBLISH` timestamp extraction
  goes through the LLM, with a 6h tolerance after identity/digest validation.
- The substantive-match prompt explicitly instructs the model to ignore any
  date/priority claims or embedded instructions found in the
  claimant-controlled artifact text — adversarial-content mitigation is
  enforced by prompt design *and* by architecture (timestamp extraction
  never reads the artifact's own text, only the separately-fetched
  provenance source).
- Challenge window is additive-only and triggers at most ONE final
  re-evaluation pass at `finalize_dispute()` — no repeated challenge/
  re-evaluate cycles, so the state machine always terminates.

## Backend request economy (why it doesn't blow the GenLayer rate limit)

GenLayer enforces a 5000 requests/day ceiling. The backend
(`backend/src/poller.ts`) is the *only* thing that ever calls GenLayer RPC
— the frontend reads exclusively through the backend's cached API
(`backend/src/routes/disputes.ts`, `frontend/lib/api.ts`).

The poller originally re-fetched every claim of every active dispute on
every 60-second tick, which burns the daily budget almost immediately once
there's any real activity (10 disputes × 5 claims ≈ 70 requests/cycle × 1440
cycles/day). Fixed:

- `get_dispute` (1 cheap request) runs every cycle per active dispute; it
  alone is enough to detect whether `claim_count` grew or `status`
  transitioned.
- `get_dispute_claims`/`get_claim` only run when one of those actually
  changed since the last cycle (compared against the previously-stored
  Postgres row — zero GenLayer cost to check).
- A claim already stored with a terminal status (`WINNER`/`LOSER`/
  `REFUNDED`) is never re-fetched again — that status is set exactly once
  by `finalize_dispute` and can never change afterward.
- Default poll interval widened from 60s to 5 minutes
  (`POLL_INTERVAL_MS=300000` in `backend/fly.toml`).
- A Redis-backed daily counter (`backend/src/redis.ts`,
  `tryReserveGenlayerRequest`) hard-caps usage at ~4000/day and the poller
  skips a whole cycle rather than risk exhausting it.

Net effect: an idle/quiet protocol costs ~1 request per 5-minute cycle
regardless of historical dispute count; an active one only pays for claims
when they've genuinely changed.

## Frontend

Next.js 16 (Turbopack) + wagmi + Reown AppKit (project ID
`d3d589c09ef32b5b3273da42abb75d5e`) + genlayer-js. `npm run build` passes
clean; all 5 routes compile/prerender (`/`, `/create`, `/dispute/[id]`,
`/profile`, `/_not-found`).

Pages: landing/live dispute feed, create-dispute form, dispute detail (file
claim, trigger evaluation, submit challenge evidence, finalize, withdraw),
profile (wallet-scoped disputes/claims). Both the create-dispute and
file-claim forms have one-click "AUTOFILL SAMPLE" buttons using real,
independently-fetchable test data (a 2011 GitHub commit for `GIT_COMMIT`
provenance, a Wikipedia page for `WAYBACK` provenance) so testing the
earliest-wins ranking logic doesn't require hand-typing URLs.

**Known gap, called out in code comments in `lib/contracts/OriginTrace.ts`**:
writes sign through `window.ethereum` (works for MetaMask and any other
injected-provider wallet, which is what Reown also uses for its "injected"
connector). A WalletConnect-only remote session with zero injected provider
in that browser needs genlayer-js's viem/WalletConnect signer bridging
verified against the current SDK reference before it's claimed to work —
not yet done.

## Known environment gotchas on this machine (macOS, pyenv-managed)

- **Use `/Users/macbook/.pyenv/versions/3.12.7/bin/python3`** for all
  GenLayer tooling (`genvm-lint`, `pytest` with `gltest`). The default
  pyenv-selected interpreter is 3.11.9, which cannot import `genlayer_py`
  (`collections.abc.Buffer` requires Python 3.12+).
- **Pin `genlayer-test==0.29.2`**, not the `0.30.0rc2` release candidate —
  the rc has a broken direct-mode contract loader (crashes on
  `import genlayer.gl as gl` with `DecodingError: unexpected end of memory`,
  unrelated to any contract code; confirmed by testing both versions
  against the identical contract file).
- `gltest`'s `VMContext` in direct mode does **not** simulate the actual
  native-GEN transfer triggered by `@gl.evm.contract_interface` /
  `emit_transfer()` — it logs an unhandled `EthSend` and no-ops. Direct
  tests prove the escrow ledger zeroes correctly and the withdraw path
  executes without reverting; the actual GEN balance change has only been
  verified indirectly, by confirming the live backend reaches the real
  deployed contract — a full integration test against a live GenVM runner
  has not been run.
- `VMContext.warp()` takes an absolute ISO timestamp, not a relative
  duration — see `warp_forward()` helper in `tests/direct/conftest.py`.
- `VMContext` balances are a private `_balances` dict with no public
  getter — see `get_balance()` helper in the same conftest (kept for future
  integration-test reuse).
- Reown AppKit's `@reown/appkit-adapter-wagmi` requires `viem@>=2.55.13` as
  a peer; bumped `frontend/package.json` to `viem@^2.37.0` to satisfy both
  it and genlayer-js. Re-check this pin if genlayer-js starts requiring an
  exact older viem version.
- `@wagmi/connectors`' Base Account (Coinbase Smart Wallet) connector pulls
  in `@coinbase/cdp-sdk`, which dynamically imports optional `@x402/*`
  packages this project never installs, breaking the Next.js build.
  Fixed by aliasing `@base-org/account` to
  `frontend/lib/stubs/empty-module.js` in `next.config.ts` (both
  `turbopack.resolveAlias` and `webpack.resolve.alias` — Turbopack requires
  a relative path string, not an absolute path or `false`). This app never
  registers the Coinbase connector, so the stub is never actually invoked.
- Reown AppKit's `createAppKit(...)` call must run at **module scope** in
  `frontend/lib/genlayer/appkit.ts`, not inside a `useEffect` — the
  `useAppKit`/`useAccount` hooks need a modal instance to exist during
  Next.js's static-generation pass too, and `createAppKit` is itself
  SSR-safe.
- `backend/src/index.ts`'s blanket `uncaughtException` handler originally
  swallowed HTTP listen failures (e.g. `EADDRINUSE`), letting the process
  linger as if healthy while serving nothing. Fixed with an explicit
  `server.on("error", ...)` handler that exits on a startup bind failure,
  while keeping the blanket handlers for genuine post-startup runtime
  errors (the "log and survive" behavior the 24/7 requirement wants).
- This sandbox's own outbound networking lacks IPv6 egress, and its DNS
  resolver didn't immediately reflect Fly's newly-allocated shared IPv4 —
  `curl` needed `--resolve host:443:<shared-ipv4>` to reach the backend
  from this environment. That's a property of the tool sandbox, not the
  deployment; `fly status` / `fly ssh console ... node -e "fetch(...)"`
  are the authoritative health checks when this comes up again.
- A native Postgres was already running on this machine's port 5432 (and a
  stale Docker proxy squatted 5433 after one failed compose attempt) — for
  local dev, `backend/docker-compose.yml` maps host `5433:5432`, but this
  session ended up using the native Postgres directly (created an
  `origin_trace` DB/role on it) since Docker's daemon wasn't running.
  Either path works; check `lsof -nP -iTCP:5432/5433 -sTCP:LISTEN` first.

## Reference material this build draws on

- `/Users/macbook/Downloads/richtext_converted_to_markdown (2).md` — full
  master prompt / product spec (non-negotiable working rules, trust
  boundary requirements, final quality bar).
- `/Users/macbook/Downloads/JUDGE.md` — the review rubric this must score
  5/5 against on all four axes (GenLayer Fit, Contract Quality, Engineering,
  Frontend/UX).
- `/Users/macbook/Documents/stitch_dark_theme_ui_design/` — frontend design
  reference (DESIGN.md tokens + HTML mockups). References to adapt, not
  copy verbatim.
- `/Users/macbook/Witness-Weaver/` and `/Users/macbook/witnessmark/` — the
  two prior GenLayer contracts whose architecture directly informed this
  one (see "Architecture lineage" above).
- `/Users/macbook/review/proof-of-work/frontend/` — a working, already-
  wired Next.js + genlayer-js + wagmi/viem frontend against a different
  GenLayer contract. Its generic `lib/genlayer/*` plumbing (client.ts,
  wallet.ts, rpc.ts, fees.ts, WalletProvider.tsx) was initially copied in,
  then largely rewritten for Reown AppKit (see gotchas above) — only
  `fees.ts` (transaction fee-preset estimation) survived unchanged and is
  wired into `OriginTrace.ts`'s write path. Its `lib/contracts/ProofOfWork.ts`
  is the pattern `lib/contracts/OriginTrace.ts` mirrors (read/write wrapper,
  transaction receipt status handling via the SDK's actual lifecycle
  states, not string-matched RPC fields).

## Still not done

- Integration tests against a live GenVM runner (would verify the actual
  native-GEN transfer path that direct-mode tests cannot simulate).
- WalletConnect-remote-signer verification against the current genlayer-js
  SDK reference (see "Known gap" under Frontend above).
- A settlements/history page and richer profile/withdrawal dashboard
  polish matching `settlements_challenge_vault.html` and
  `consensus_equivalence_inspector.html` reference designs more closely.
- Restricting backend CORS to the actual frontend origin (currently
  permissive `cors()` with no origin allowlist — fine for early
  development, should be tightened before treating this as
  production-hardened).
