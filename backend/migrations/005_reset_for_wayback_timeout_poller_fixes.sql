-- Fourth one-time reset: the contract was redeployed again after fixing
-- WAYBACK's same unbound-endpoint hole PLATFORM_PUBLISH had, and a
-- claim_dispute_timeout bug that could override an active challenge
-- window. Same collision reasoning as 002/003/004.
TRUNCATE claims, disputes RESTART IDENTITY CASCADE;
UPDATE sync_state SET known_dispute_count = 0, last_full_sync_at = NULL WHERE id = 1;
