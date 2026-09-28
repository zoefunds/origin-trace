# Deployment reference

Status: **contract deployed, both live services wired and confirmed
reaching it.** This doc is kept as a reference for redeploying any piece
(a new contract version, a backend/frontend update, or a fresh environment
entirely) — not a pending checklist.

## Current live state

| Piece | Where | Address / URL |
|---|---|---|
| Contract | GenLayer StudioNet | `0x6B3321b0d92E614abC11dA7D241a8918879DcEe1` |
| Backend | Fly.io app `origin-trace-backend-starlit-sound-5755`, region `iad` | https://origin-trace-backend-starlit-sound-5755.fly.dev |
| Backend DB | Fly Postgres cluster attached to the app | internal only, via `DATABASE_URL` secret |
| Backend cache | Fly Upstash Redis `origin-trace-cache` | via `REDIS_URL` secret |
| Frontend | Vercel project `origin-trace`, scope `adebiyi2002gmailcoms-projects` | https://origin-trace-wine.vercel.app |

Confirmed working end-to-end: `fly logs -a origin-trace-backend-starlit-sound-5755` shows the
poller successfully calling `get_contract_info()` against the real
contract and cycling cleanly (`[poller] cycle complete: N total disputes,
M active re-synced, K had claim changes worth fetching`); the frontend
loads in a real browser with the design system rendering correctly and the
Reown wallet modal opening with the full wallet list.

## Redeploying the contract (if you ship a new version)

The contract is always deployed by the project owner, not by any tooling
in this repo — that's a deliberate project rule, not a limitation.

```bash
# from repo root, Python 3.12+ (see memory/MEMORY.md for why)
pip install -r requirements.txt
genvm-lint check contracts/origin_trace.py
pytest tests/direct/ -v
```

Then deploy via the GenLayer CLI / Studio following the current official
workflow at https://docs.genlayer.com and https://skills.genlayer.com. Once
you have a new `DEPLOYED_CONTRACT_ADDRESS`, wire it into both live services:

### Backend (Fly.io)

```bash
fly secrets set -a origin-trace-backend-starlit-sound-5755 CONTRACT_ADDRESS="0xYOUR_NEW_ADDRESS"
```

Fly redeploys the machine automatically on secret change. Confirm:

```bash
fly logs -a origin-trace-backend-starlit-sound-5755
```

You should see `[poller] cycle complete: ...` lines, not a `CONTRACT_ADDRESS
is not configured yet` error.

### Frontend (Vercel)

```bash
cd frontend
vercel env rm NEXT_PUBLIC_CONTRACT_ADDRESS production --scope adebiyi2002gmailcoms-projects --yes
echo -n "0xYOUR_NEW_ADDRESS" | vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production --scope adebiyi2002gmailcoms-projects
vercel deploy --prod --yes --scope adebiyi2002gmailcoms-projects
```

Also update local `.env.local` / `.env` (both gitignored) if developing
locally:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_NEW_ADDRESS   # frontend/.env.local
CONTRACT_ADDRESS=0xYOUR_NEW_ADDRESS               # backend/.env
```

## Verifying the full loop end-to-end

1. Open https://origin-trace-wine.vercel.app, connect a wallet funded with
   GEN on StudioNet.
2. Go to `/create`, click **AUTOFILL SAMPLE**, submit.
3. From a second wallet, open the new dispute and click **AUTOFILL SAMPLE
   A** (or **B**) on the file-claim form, then submit — repeat from a third
   wallet with the other sample if you want a genuine two-claim race.
4. Confirm the backend picked it up:
  `curl https://origin-trace-backend-starlit-sound-5755.fly.dev/api/disputes`
5. Wait for the filing window to close (the autofill sample uses a 24h
   window — shorten it in `frontend/app/create/page.tsx`'s
   `FILING_WINDOW_OPTIONS` for faster local testing if needed), then click
   **TRIGGER EVALUATION**.
6. Watch the preliminary ranking post. Optionally submit challenge evidence
   (the claim card has a **SAMPLE** button for this too) before the
   challenge window closes.
7. Click **FINALIZE**, then **WITHDRAW** on the winning/refunded claim.

## Redeploying the backend

```bash
cd backend
fly deploy --ha=false
```

`--ha=false` avoids provisioning a second machine for local iteration; drop
it (or set it explicitly to run 2 machines) if you want real high
availability rather than just the single always-on machine currently
running.

## Redeploying the frontend

```bash
cd frontend
vercel deploy --prod --yes --scope adebiyi2002gmailcoms-projects
```

## Ongoing costs

- **Fly.io**: one always-on `shared-cpu-1x` / 512MB machine
  (`origin-trace-backend-starlit-sound-5755`) plus one Postgres node (1GB
  volume, unmanaged flex — the user is responsible for its own ops/backups,
  per Fly's own warning at creation time). Both are configured to never
  scale to zero, per the "must never die" requirement — this means they
  bill continuously, not just when someone visits the site. Check `fly
  billing` or the Fly dashboard for current rates on the `personal` org.
- **Upstash Redis**: pay-as-you-go on request volume. The backend caps
  itself at ~4000 GenLayer RPC requests/day via its own Redis counter (see
  `backend/src/redis.ts` and the "Request economy" section of the main
  README) — but its own Redis usage for the API-layer cache scales with
  frontend traffic, independent of that cap. Monitor if traffic grows.
- **Vercel**: frontend hosting, typically free at low traffic on a hobby
  plan.

## Tearing it all down

```bash
fly apps destroy origin-trace-backend-starlit-sound-5755
fly apps destroy origin-trace-backend-starlit-sound-5755-db
vercel remove origin-trace --scope adebiyi2002gmailcoms-projects
```

This does not affect the deployed contract — GenLayer contracts, once
deployed, exist independently of this app's infrastructure.
