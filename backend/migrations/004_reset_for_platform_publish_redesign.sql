-- Third one-time reset: the contract was redeployed again after fixing
-- PLATFORM_PUBLISH's binding (same-host + self-declared JSON fields was
-- not proof of an authoritative platform record -- see review3.md). Same
-- collision reasoning as 002/003.
TRUNCATE claims, disputes RESTART IDENTITY CASCADE;
UPDATE sync_state SET known_dispute_count = 0, last_full_sync_at = NULL WHERE id = 1;
