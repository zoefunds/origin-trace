-- ORIGIN TRACE indexer schema.
-- The backend never invents state: every row here is a cached mirror of a
-- read the backend performed against the deployed GenLayer contract. The
-- contract itself remains the single source of truth; Postgres exists only
-- to serve fast, rate-limit-friendly reads to the frontend and to keep
-- historical dispute activity queryable without re-hitting GenLayer RPC.

CREATE TABLE IF NOT EXISTS disputes (
    dispute_id              TEXT PRIMARY KEY,
    creator                 TEXT NOT NULL,
    idea_title              TEXT NOT NULL,
    idea_description        TEXT NOT NULL,
    status                  TEXT NOT NULL,
    required_stake_wei      NUMERIC(78, 0) NOT NULL,
    stake_pool_deposited    NUMERIC(78, 0) NOT NULL,
    claim_count             INTEGER NOT NULL DEFAULT 0,
    created_ts              BIGINT NOT NULL,
    filing_deadline_ts      BIGINT NOT NULL,
    evaluation_timeout_ts   BIGINT NOT NULL,
    leading_claim_id        TEXT NOT NULL DEFAULT '',
    ranking_verdict         TEXT NOT NULL DEFAULT '',
    ranking_rationale       TEXT NOT NULL DEFAULT '',
    ranked_ts               BIGINT NOT NULL DEFAULT 0,
    challenge_deadline_ts   BIGINT NOT NULL DEFAULT 0,
    had_challenge_evidence  BOOLEAN NOT NULL DEFAULT FALSE,
    final_winner_claim_id   TEXT NOT NULL DEFAULT '',
    finalized_ts            BIGINT NOT NULL DEFAULT 0,
    -- bookkeeping for the poller, not part of on-chain state
    last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
    claim_id                TEXT PRIMARY KEY,
    dispute_id              TEXT NOT NULL REFERENCES disputes(dispute_id),
    claimant                TEXT NOT NULL,
    artifact_url            TEXT NOT NULL,
    provenance_type         TEXT NOT NULL,
    provenance_hint_url     TEXT NOT NULL DEFAULT '',
    stake_wei               NUMERIC(78, 0) NOT NULL,
    stake_deposited         NUMERIC(78, 0) NOT NULL,
    status                  TEXT NOT NULL,
    estimated_earliest_ts   BIGINT NOT NULL DEFAULT 0,
    timestamp_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    match_score_bps         INTEGER NOT NULL DEFAULT 0,
    evaluation_notes        TEXT NOT NULL DEFAULT '',
    challenge_evidence      JSONB NOT NULL DEFAULT '[]',
    filed_ts                BIGINT NOT NULL,
    evaluated_ts            BIGINT NOT NULL DEFAULT 0,
    last_synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_dispute_id ON claims(dispute_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_creator ON disputes(creator);
CREATE INDEX IF NOT EXISTS idx_claims_claimant ON claims(claimant);

-- Tracks how many disputes exist on-chain (next_dispute_seq) so the poller
-- knows which dispute_ids to walk without needing a contract-side
-- "list all disputes" view (TreeMap has no enumeration primitive exposed).
CREATE TABLE IF NOT EXISTS sync_state (
    id                      SMALLINT PRIMARY KEY DEFAULT 1,
    known_dispute_count     INTEGER NOT NULL DEFAULT 0,
    last_full_sync_at       TIMESTAMPTZ,
    CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO sync_state (id, known_dispute_count) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
