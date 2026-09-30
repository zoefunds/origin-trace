-- Second one-time reset: the contract was redeployed again after a real
-- bug was found via live e2e testing (GIT_COMMIT claims fetching a GitHub
-- blob-view HTML page instead of raw content for digest binding -- see
-- review2.md). Same collision reasoning as 002_reset_for_new_contract.sql:
-- the new contract's dispute:0/claim:0 etc. would otherwise be conflated
-- with the previous contract's real (but now-superseded) test data.
TRUNCATE claims, disputes RESTART IDENTITY CASCADE;
UPDATE sync_state SET known_dispute_count = 0, last_full_sync_at = NULL WHERE id = 1;
