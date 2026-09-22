# Contract deployment checklist (you do this part)

The GenLayer Intelligent Contract is written, linted, and tested — but per
the project's own working rules, **the contract is deployed by you, not by
this tooling.** Once you've deployed it, come back and complete these steps
so the rest of the (already-live) app picks it up.

## 1. Deploy `contracts/origin_trace.py` to StudioNet

Use the GenLayer CLI / GenLayer Studio, following the current official
workflow at https://docs.genlayer.com and https://skills.genlayer.com.

Before deploying, it's worth re-running the quality gates one more time:

```bash
# use Python 3.12+ -- see memory/MEMORY.md for why
pip install -r requirements.txt
genvm-lint check contracts/origin_trace.py
pytest tests/direct/ -v
```

After deployment, you'll have a `DEPLOYED_CONTRACT_ADDRESS` (a `0x...`
EVM-style address).

## 2. Wire the address into the live backend (Fly.io)

The backend is already deployed and running 24/7 at
**https://origin-trace-backend.fly.dev**. It currently has an empty
`CONTRACT_ADDRESS`, so its poller is idling (logging a clear "not
configured yet" message every cycle rather than erroring). Set it:

```bash
fly secrets set -a origin-trace-backend CONTRACT_ADDRESS="0xYOUR_ADDRESS"
```

Fly will automatically redeploy the machine with the new secret. Confirm
the poller picks it up:

```bash
fly logs -a origin-trace-backend
```

You should see `[poller] cycle complete: 0 total disputes, 0 active
re-synced` instead of the "not configured" error.

## 3. Wire the address into the live frontend (Vercel)

The frontend is already deployed and running at
**https://origin-trace-wine.vercel.app**.

```bash
cd frontend
echo -n "0xYOUR_ADDRESS" | vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production --scope adebiyi2002gmailcoms-projects
vercel deploy --prod --yes --scope adebiyi2002gmailcoms-projects
```

Also update your local `.env.local` if you're running the frontend locally
for development:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_ADDRESS
```

## 4. Verify the full loop end-to-end

1. Open https://origin-trace-wine.vercel.app, connect a wallet funded with
   GEN on StudioNet.
2. File a dispute (`/create`).
3. From a second address, file a competing claim on that dispute.
4. Wait for the filing window to close, then trigger evaluation.
5. Confirm the backend picked up the new dispute:
   `curl https://origin-trace-backend.fly.dev/api/disputes`
6. Watch the ranking post, let the challenge window close, finalize, and
   withdraw.

## Ongoing costs to be aware of

- **Fly.io**: one always-on `shared-cpu-1x` / 512MB machine
  (`origin-trace-backend`) plus one Postgres node
  (`origin-trace-db`, 1GB volume). Both are configured to never scale to
  zero, per the "must never die" requirement — this means they bill
  continuously, not just when someone starts them. Check
  `fly billing` / the Fly dashboard for current rates.
- **Upstash Redis**: pay-as-you-go on request volume. The backend caps
  itself at ~4000 GenLayer RPC requests/day via its own Redis counter, but
  its own Redis usage (cache reads/writes for the API layer) scales with
  frontend traffic — monitor this if traffic grows significantly.
- **Vercel**: frontend hosting, typically free at low traffic on a hobby
  plan.

## If you want to tear it all down

```bash
fly apps destroy origin-trace-backend
fly apps destroy origin-trace-db
vercel remove origin-trace --scope adebiyi2002gmailcoms-projects
```
