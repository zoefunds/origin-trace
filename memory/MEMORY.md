# ORIGIN TRACE — Project Memory

This file is the persistent source of truth for this project across sessions.
Read it first before making architectural decisions. Update it whenever a
decision changes.

## Deployed contract address

`0xda68997ac7D581aa0C280e0547cCf5375935c710` — deployed by the user to
GenLayer StudioNet. Wired into both live services:
- Fly secret `CONTRACT_ADDRESS` on `origin-trace-backend` (confirmed via
  `fly logs`: poller now reaches the real contract, `get_contract_info()`
  succeeds, `0 total disputes` since none have been created yet).
- Vercel env var `NEXT_PUBLIC_CONTRACT_ADDRESS` on the `origin-trace`
  project, production environment (redeployed after setting it).
- Local `backend/.env` and `frontend/.env.local` (gitignored, not
  committed — this is why there was nothing to `git commit` after wiring
  the address in; only the live secrets stores and local env files changed).

## What this project is

ORIGIN TRACE is an onchain priority-dispute resolution protocol. Two or more
parties each stake GEN claiming they made a specific idea/design/work first.
Each claim pins one artifact URL at filing time (immutable after). GenLayer
validators independently fetch every claimant's artifact + a third-party
provenance source for it (never the claimant's self-reported date), and a
deterministic function ranks claims and pays out from the resulting
structured (timestamp, match_score) data. Full spec: see the original master
prompt (richtext_converted_to_markdown (2).md) and JUDGE.md (the review
rubric this project is being built to score 5/5 against).

## Repository location

**Everything lives in `/Users/macbook/origin`.** Do not build in
`/Users/macbook/review` — that directory holds an unrelated pre-existing
project (`proof-of-work`) that must not be touched or confused with this one.

## Locked architecture decisions

- **Backend datastore**: self-hosted PostgreSQL via Docker.
- **Backend hosting**: Fly.io (24/7 always-on, auto-restart — "must never
  die" requirement). Fly CLI already installed on this machine.
- **Auth**: wallet-based (SIWE-style message signing via MetaMask/Rainbow/
  Zerion). No custodied private keys, no email/password option chosen.
- **Filing window**: 48h default (`DEFAULT_FILING_WINDOW_SECONDS`).
- **Timestamp tolerance for INCONCLUSIVE**: 24h
  (`TIMESTAMP_TOLERANCE_SECONDS`).
- **Challenge window**: 24h fixed default
  (`DEFAULT_CHALLENGE_WINDOW_SECONDS`), but actually configurable per-dispute
  at `create_dispute()` time within `[2h, 14d]` bounds.
- **Provenance scope at launch**: generic — WAYBACK (web archive), GIT_COMMIT
  (GitHub/GitLab commit API), PLATFORM_PUBLISH (LLM-extracted platform
  metadata) all supported from day one, not narrowed to one type.
- **Contract deployment boundary**: I (the agent) write, lint, and test the
  contract. The user deploys it themselves to GenLayer Studio/StudioNet and
  provides the resulting `DEPLOYED_CONTRACT_ADDRESS` back. The agent never
  deploys or holds a contract address.
- **Frontend design system**: dark cryptographic-terminal aesthetic from
  `/Users/macbook/Documents/stitch_dark_theme_ui_design/DESIGN.md` — obsidian
  surfaces (#090D14/#0D131F/#131B2B/#1B263B), cyan primary (#00F0FF), teal
  secondary (#00D2B4), amber for challenge/timer states (#FFB020), Inter for
  prose, JetBrains Mono for all hashes/timestamps/addresses/stake amounts.
  Non-pill badges only (2-4px radius) for lifecycle states: FILING_OPEN,
  VALIDATING, CHALLENGE_WINDOW, FINALIZED, INCONCLUSIVE.

## Contract status (as of this session)

File: `/Users/macbook/origin/contracts/origin_trace.py` — **1482 lines**.

- `genvm-lint check` passes clean (0 errors, 1 informational warning about a
  newer runner being available — intentionally still pinned to
  `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6` to match
  the exact runner used by the two reference projects this was modeled on).
- Schema extraction succeeds (14 methods, 0 ctor params) — rules out the
  "could not load contract schema" failure mode the user explicitly flagged.
- **19/19 direct-mode tests pass** (`tests/direct/test_origin_trace_lifecycle.py`).
  Covers: full winner lifecycle, near-tie → INCONCLUSIVE, unverifiable
  provenance → INCONCLUSIVE, adversarial in-page date-forgery resistance,
  non-matching-but-earliest claim ineligibility, access control (cancel,
  withdraw, challenge-evidence-own-claim-only), single-filer refund,
  full-timeout refund, challenge-window timing enforcement, and the
  deterministic GIT_COMMIT timestamp parse path.

### Architecture modeled on two prior GenLayer projects that scored 560/480
points after AI review: `Witness-Weaver` (WitnessWeave contract) and
`witnessmark`. Key patterns reused directly:
- Single `_send_gen` escrow choke point; zero-ledger-then-transfer ordering
  everywhere money moves (reentrancy-safe by construction).
- `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` with the validator
  **independently re-deriving** the entire result (its own fetch, its own
  LLM call) rather than trusting the leader's output.
- Structured error classification (`[EXPECTED]`/`[EXTERNAL]`/`[TRANSIENT]`/
  `[LLM_ERROR]`) so leader/validator disagreement is meaningful instead of
  "any exception = disagree."
- Deterministic ranking/payout fully separated from the nondet evaluation
  step — the LLM/validators only ever produce a structured per-claim
  `(timestamp, match_score)` result; a pure Python function ranks and a pull
  -based `withdraw()` pays out.

### Trust-boundary-specific additions unique to this contract
- Timestamp extraction for WAYBACK and GIT_COMMIT is **fully deterministic
  JSON parsing** (no LLM in that path at all) — leader/validator must match
  EXACTLY on these, which is a stronger equivalence bar than an LLM-derived
  value. Only PLATFORM_PUBLISH timestamps go through the LLM (unstructured
  metadata), and get a 6h tolerance.
- The substantive-match LLM prompt explicitly instructs the model to ignore
  any date/priority claims or embedded instructions found in the
  claimant-controlled artifact page text — adversarial-content mitigation
  is enforced by prompt design *and* by architecture (timestamp extraction
  never reads the artifact's own text, only the separately-fetched
  provenance source).
- Challenge window is additive-only (extra provenance URLs per claim, never
  a replacement artifact) and triggers at most ONE final re-evaluation pass
  at `finalize_dispute()` — no repeated challenge/re-evaluate cycles, so the
  state machine always terminates (avoids "undetermined consensus" from
  leader-rotation storms, a requirement the user was explicit about).

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
  tests can and do prove the escrow ledger zeroes correctly and the
  withdraw path executes without reverting, but the actual GEN balance
  change can only be verified with integration tests against a real
  Studio/GLSim runner (not yet run in this session).
- `VMContext` has `warp(iso_timestamp_string)` (absolute), not a relative
  `warp_seconds()` — see `warp_forward()` helper in `tests/direct/conftest.py`.
- `VMContext` balances are a private `_balances` dict with no public
  getter — see `get_balance()` helper in the same conftest (only used for
  documentation purposes now since direct mode can't credit transfers
  anyway; kept for future integration-test reuse).
- Reown AppKit's `@reown/appkit-adapter-wagmi` requires `viem@>=2.55.13` as
  a peer, but genlayer-js's own examples pin `viem@2.21.54` — bumped to
  `^2.37.0` in `frontend/package.json` to satisfy both; re-check this pin
  if genlayer-js starts requiring an exact older viem version.
- `@wagmi/connectors`' Base Account (Coinbase Smart Wallet) connector pulls
  in `@coinbase/cdp-sdk`, which dynamically imports optional `@x402/*`
  packages this project never installs. Next.js (both Turbopack and
  webpack) tries to statically resolve these at build time and fails.
  Fixed by aliasing `@base-org/account` to
  `frontend/lib/stubs/empty-module.js` in `next.config.ts` (both
  `turbopack.resolveAlias` and `webpack.resolve.alias` — Turbopack requires
  a relative path string like `"./lib/stubs/..."`, not an absolute path or
  `false`). This app never registers the Coinbase connector, so the stub is
  never actually invoked at runtime.
- Reown AppKit's `createAppKit(...)` call must run at **module scope** in
  `frontend/lib/genlayer/appkit.ts`, not inside a `useEffect` — the
  `useAppKit`/`useAccount` hooks need a modal instance to already exist
  during Next.js's static-generation pass too, and `createAppKit` is itself
  SSR-safe.
- A native Postgres was already running on this machine's port 5432 (and a
  stale Docker proxy ended up squatting 5433 too after one failed compose
  attempt) — `backend/docker-compose.yml` maps host `5433:5432`; if that
  port is also unavailable, either free it or remap again before running
  `docker compose up -d postgres` locally.

## Backend/frontend status (this session)

- **Backend** (`backend/`): Express + Postgres + ioredis, `npm run build`
  (tsc) passes clean. Not yet verified against a live Postgres/Redis in
  this session (local Docker port conflict — see above); the code compiles
  and the logic (poller, rate-limit-guarded GenLayer reads, cached API
  routes) has not been runtime-tested end-to-end yet. `fly.toml` written
  (`min_machines_running=1`, `auto_stop_machines=false`) but **not
  deployed** — deploying costs money and wasn't done without the user
  explicitly confirming that specific spend.
- **Frontend** (`frontend/`): Next.js 16 + wagmi + Reown AppKit (project ID
  `d3d589c09ef32b5b3273da42abb75d5e`, covers MetaMask/Rainbow/Zerion/any
  WalletConnect wallet through one connect flow) + genlayer-js.
  `npm run build` passes clean (all 5 routes compile/prerender: `/`,
  `/create`, `/dispute/[id]`, `/profile`). Pages built: landing/dispute
  feed, create-dispute form, dispute detail (file claim, trigger
  evaluation, submit challenge evidence, finalize, withdraw), profile
  (my disputes/claims). Reads go through the backend's cached API
  (`lib/api.ts`) to protect the GenLayer daily request budget; writes go
  directly through the connected wallet via `lib/contracts/OriginTrace.ts`.
- **Known gap, called out in code comments**: `OriginTrace.ts` signs writes
  through `window.ethereum` (works for MetaMask/injected wallets, which is
  what Reown also uses for its "injected" connector). A WalletConnect-only
  remote session with zero injected provider in that browser needs
  genlayer-js's viem/WalletConnect signer bridging verified against the
  current SDK reference before it's claimed to work — not yet done.
- **Repository**: pushed to `github.com/zoefunds/origin-trace` (real
  secrets in `backend/.env`/`frontend/.env.local` are gitignored — only
  `.env.example` placeholders are committed; the Reown project ID is a
  public client-side identifier and is fine to commit).

## Live deployments (as of this session)

The user explicitly asked to "do everything," including infra spend, so both
sides were deployed for real:

- **Backend**: `origin-trace-backend` on Fly.io, org `personal`, region
  `iad`. Live at https://origin-trace-backend.fly.dev — verified with real
  HTTP requests (`/healthz`, `/api/disputes`, `/api/disputes/_meta/budget`
  all responding correctly against the real Postgres + real Upstash Redis).
  `min_machines_running=1` / `auto_stop_machines=false` per fly.toml (never
  scales to zero). Fly Postgres cluster `origin-trace-db` (unmanaged flex,
  1 node, shared-cpu-1x, 1GB volume) attached via `fly postgres attach` —
  `DATABASE_URL` was auto-set as a Fly secret by that command, not manually
  typed. `REDIS_URL`/`GENLAYER_RPC_URL`/`CONTRACT_ADDRESS` set via
  `fly secrets set`. **This costs real money on the user's Fly account
  (personal org, owner priscillageorge83@gmail.com)** — a small Postgres
  node plus one always-on shared-cpu-1x machine. If the project is
  abandoned, tear both down with `fly apps destroy origin-trace-backend`
  and `fly apps destroy origin-trace-db`.
- **Frontend**: Vercel project `origin-trace` under scope
  `adebiyi2002gmailcoms-projects`. Live at
  https://origin-trace-wine.vercel.app — verified by loading it in a real
  browser: design system renders correctly, wallet connect button opens the
  Reown modal with WalletConnect/MetaMask/Trust Wallet/Binance/SafePal all
  listed. Env vars set via `vercel env add ... production` (mirrors
  `frontend/.env.local`); `NEXT_PUBLIC_CONTRACT_ADDRESS` is still empty
  since the contract isn't deployed yet — update it with
  `vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production` once the user
  deploys the contract, then redeploy with `vercel deploy --prod`.
- Found and fixed a real bug while verifying the backend locally before
  deploying: `backend/src/index.ts`'s blanket `uncaughtException` handler
  was swallowing `EADDRINUSE`-style listen failures, so a process that
  failed to bind its port would sit there logging as if healthy while
  serving nothing. Fixed by attaching an explicit `server.on("error", ...)`
  handler that calls `process.exit(1)` on a startup bind failure, while
  keeping the blanket handlers for genuine post-startup runtime errors (the
  "log and survive" behavior the 24/7 requirement actually wants).
- This sandbox's own outbound networking lacks IPv6 egress and its DNS
  resolver didn't immediately reflect the newly-allocated shared IPv4 for
  `origin-trace-backend.fly.dev` — `curl` from this environment needed
  `--resolve host:443:<shared-ipv4>` to actually reach it. This is a
  property of the tool sandbox, not the deployment; `fly status` and
  `fly ssh console ... node -e "fetch(...)"` were used as the authoritative
  health checks instead.

## Still not done

- Integration tests against a live GenVM runner (once the user deploys the
  contract to StudioNet).
- Wiring `NEXT_PUBLIC_CONTRACT_ADDRESS` / Fly's `CONTRACT_ADDRESS` once the
  user provides the deployed contract address (see DEPLOY.md).
- Settlements/history page, richer profile/withdrawal dashboard polish
  matching `settlements_challenge_vault.html` and
  `consensus_equivalence_inspector.html` reference designs more closely.
- Restricting backend CORS to the actual frontend origin (currently
  permissive `cors()` with no origin allowlist — fine for early development,
  should be tightened before treating this as production-hardened).

## Reference material this build draws on

- `/Users/macbook/Downloads/richtext_converted_to_markdown (2).md` — the
  full master prompt / product spec (non-negotiable working rules, trust
  boundary requirements, final quality bar).
- `/Users/macbook/Downloads/JUDGE.md` — the review rubric this must score
  5/5 against on all four axes (GenLayer Fit, Contract Quality, Engineering,
  Frontend/UX).
- `/Users/macbook/Documents/stitch_dark_theme_ui_design/` — frontend design
  reference (DESIGN.md tokens + HTML mockups for dispute explorer, claim
  filing, consensus inspector, settlements/challenge vault, landing page,
  logo). These are references to adapt, not to copy verbatim.
- `/Users/macbook/Witness-Weaver/contracts/witnessweave_contract.py` and
  `/Users/macbook/witnessmark/contracts/witnessmark_contract.py` — the two
  prior GenLayer contracts that scored 560/480 points; architecture directly
  informed this contract (see above).
- `/Users/macbook/review/proof-of-work/frontend/` — a working, already-wired
  Next.js + genlayer-js + wagmi/viem frontend against a different GenLayer
  contract. Its `lib/genlayer/*` files (client.ts, wallet.ts, rpc.ts,
  fees.ts, WalletProvider.tsx) are generic GenLayer plumbing and were copied
  as-is into `/Users/macbook/origin/frontend/lib/genlayer/`. Its
  `lib/contracts/ProofOfWork.ts` is the pattern `lib/contracts/OriginTrace.ts`
  should mirror (read/write wrapper, transaction receipt status handling via
  the SDK's actual lifecycle states, not string-matched RPC fields).

## What's NOT done yet (as of this session)

- Frontend pages (landing, create-dispute, claim-filing, dispute detail
  with live evaluation/consensus status, challenge submission, withdrawal
  dashboard, history, profile, settings) — scaffolding started
  (`frontend/` directory with copied genlayer plumbing + shadcn ui
  components), but `lib/contracts/OriginTrace.ts` and the actual pages are
  not yet written.
- Backend (Postgres schema, Docker setup, Fly.io deployment config, auth,
  dispute/claim indexing off the contract).
- Favicon/logo (reference: `origin_trace_protocol_logo.html`).
- Integration tests against a live GenVM runner (to verify the actual
  native-GEN transfer path that direct mode cannot simulate).
- Deployment checklist/instructions handoff document for the user's own
  StudioNet deployment.
