-- One-time data reset: the contract was redeployed to a new address (see
-- review2.md), and disputes/claims are keyed only by their on-chain id
-- ("dispute:0", "claim:0", ...), which restarts from zero on every fresh
-- contract deployment with no column scoping a row to which contract it
-- came from. Without this, the previous deployment's cached rows collide
-- with the new deployment's real data (confirmed live: a stale idea_title
-- from the old contract stayed while claim_count got silently patched in
-- from the new one -- see upsertDispute's ON CONFLICT clause in db.ts,
-- which only patches mutable lifecycle fields, never idea_title/creator/
-- required_stake_wei/created_ts).
--
-- This migration is tracked in schema_migrations (see runMigrations in
-- db.ts) and therefore runs exactly once, on the first deploy after it is
-- added -- it does not re-truncate on every future deploy.
TRUNCATE claims, disputes RESTART IDENTITY CASCADE;
UPDATE sync_state SET known_dispute_count = 0, last_full_sync_at = NULL WHERE id = 1;
