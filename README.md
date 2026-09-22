# ORIGIN TRACE

> Claim you made it first. Let the public timeline decide.

ORIGIN TRACE is an onchain priority-dispute resolution protocol. Two or more
parties each stake GEN claiming they made a specific idea, design, or piece
of work first. Each claim pins one precommitted public artifact URL at
filing time — immutable afterward. When the filing window closes, GenLayer
validators independently fetch every claimant's artifact plus a
**third-party** provenance source for it (a web-archive snapshot, a git
host's commit API, or platform-reported publish metadata) — never the
claimant's own stated date — and derive a structured
`(estimated_earliest_timestamp, substantive_match_score)` result per claim.
A fully separate deterministic function ranks claims and computes payout
from that result. A challenge window then allows additive-only provenance
evidence before funds become withdrawable.

```
DISPUTE + FILING WINDOW
        ↓
COMPETING CLAIMS (each pinned to one artifact)
        ↓
INDEPENDENT VALIDATOR FETCH (artifact + third-party provenance)
        ↓
EQUIVALENCE ON STRUCTURED TIMESTAMP + MATCH RESULT
        ↓
DETERMINISTIC RANKING & PAYOUT
        ↓
CHALLENGE WINDOW (additive provenance only)
        ↓
FINALIZED — PULL-BASED WITHDRAWAL
```

## Repository layout

```
contracts/            GenLayer Intelligent Contract (Python, GenVM)
tests/direct/          Fast in-memory contract tests (mocked web/LLM)
frontend/              Next.js app (wallet connect, dispute UI)
backend/               Always-on indexer/API (Postgres + Redis cache in front of GenLayer RPC)
memory/                Persistent project memory/decision log
```

## Contract

`contracts/origin_trace.py` — see the file's own module docstring for the
full trust-boundary design (no self-reported dates, independent
leader/validator re-derivation, adversarial-content mitigation, INCONCLUSIVE
handling, additive-only challenge evidence, pull-based withdrawal).

```bash
# from repo root, with the GenLayer toolchain's Python 3.12+ interpreter
pip install -r requirements.txt
genvm-lint check contracts/origin_trace.py
pytest tests/direct/ -v
```

**Deployment is done by the project owner, not by this repo's tooling.**
Deploy `contracts/origin_trace.py` yourself via the GenLayer CLI /
GenLayer Studio to StudioNet, then set the resulting contract address in
`frontend/.env.local` (`NEXT_PUBLIC_CONTRACT_ADDRESS`) and `backend/.env`
(`CONTRACT_ADDRESS`).

## Frontend

Next.js 16 + wagmi + Reown AppKit (WalletConnect, MetaMask, Rainbow,
Zerion, and any other injected/WalletConnect-compatible wallet through one
connect flow) + genlayer-js.

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_CONTRACT_ADDRESS once deployed
npm run dev
```

## Backend

Always-on Node/Express indexer that polls the deployed contract on a fixed
interval, mirrors dispute/claim state into Postgres, and serves cached reads
to the frontend. This is what keeps the whole app within **GenLayer's daily
request rate limit**: the backend is the only thing that ever calls GenLayer
RPC directly, guarded by a Redis-backed daily budget counter, so any number
of frontend visitors costs zero additional GenLayer requests.

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, REDIS_URL, CONTRACT_ADDRESS
docker compose up -d postgres
npm install
npm run dev
```

Deploy target: Fly.io (`fly.toml` included, `min_machines_running = 1` /
`auto_stop_machines = false` so it never scales to zero — the "must never
die" requirement).

## Security notes

- `backend/.env` and `frontend/.env.local` are gitignored — never commit
  real Redis/Postgres credentials. `.env.example` files hold placeholders
  only (except the Reown project ID, which is a public client-side
  identifier, not a secret).
- If a Redis or database credential is ever pasted into a chat, ticket, or
  shared document, rotate it — treat it as compromised the moment it left
  the vault it lives in.
