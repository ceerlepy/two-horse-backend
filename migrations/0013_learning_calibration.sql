-- Stable identities in operational race data.
ALTER TABLE runners
ADD COLUMN horse_id TEXT;

ALTER TABLE runners
ADD COLUMN jockey_id TEXT;

ALTER TABLE runners
ADD COLUMN jockey_profile_url TEXT;


-- Stable identities in immutable learning data.
ALTER TABLE learning_runner_features
ADD COLUMN horse_id TEXT;

ALTER TABLE learning_runner_features
ADD COLUMN jockey_id TEXT;


-- Source-level immutable pre-race expert picks.
CREATE TABLE IF NOT EXISTS learning_expert_picks (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,

  horse_id TEXT,
  horse_name TEXT NOT NULL,

  source_key TEXT NOT NULL,

  confidence REAL,

  is_banko INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_strong INTEGER NOT NULL DEFAULT 0,
  is_star INTEGER NOT NULL DEFAULT 0,
  is_rival INTEGER NOT NULL DEFAULT 0,
  is_surprise INTEGER NOT NULL DEFAULT 0,
  is_avoid INTEGER NOT NULL DEFAULT 0,

  is_positive INTEGER NOT NULL DEFAULT 0,

  finish_position INTEGER,

  snapshot_at TEXT NOT NULL,
  labelled_at TEXT,

  PRIMARY KEY(
    race_date,
    city,
    race_number,
    horse_number,
    source_key
  )
);

CREATE INDEX IF NOT EXISTS
idx_learning_expert_source
ON learning_expert_picks(
  source_key,
  race_date
);


-- Context-aware learned priors.
--
-- entity_type:
-- horse
-- jockey
-- horse_jockey
CREATE TABLE IF NOT EXISTS learning_context_priors (
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,

  city TEXT NOT NULL,
  track TEXT NOT NULL,
  distance_band TEXT NOT NULL,

  sample_size INTEGER NOT NULL,

  wins INTEGER NOT NULL,
  top3 INTEGER NOT NULL,

  win_rate REAL NOT NULL,
  top3_rate REAL NOT NULL,
  avg_finish REAL,

  updated_at TEXT NOT NULL,

  PRIMARY KEY(
    entity_type,
    entity_key,
    city,
    track,
    distance_band
  )
);

CREATE INDEX IF NOT EXISTS
idx_learning_context_lookup
ON learning_context_priors(
  entity_type,
  entity_key,
  city,
  track,
  distance_band
);


-- Expert calibration is bounded in application code.
ALTER TABLE expert_learning_priors
ADD COLUMN positive_pick_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE expert_learning_priors
ADD COLUMN multiplier REAL NOT NULL DEFAULT 1.0;
