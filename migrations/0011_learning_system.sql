-- ==========================================================
-- LEAKAGE-SAFE RACING LEARNING DATASET
--
-- Principle:
-- prediction-time features are frozen BEFORE result labels.
-- Results are attached afterwards and never rewrite features.
-- ==========================================================

CREATE TABLE IF NOT EXISTS learning_races (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,

  starts_at TEXT,
  distance_meters INTEGER,
  track TEXT,

  snapshot_at TEXT NOT NULL,
  labelled_at TEXT,

  PRIMARY KEY (
    race_date,
    city,
    race_number
  )
);

CREATE TABLE IF NOT EXISTS learning_runner_features (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,

  horse_name TEXT NOT NULL,

  -- Race-specific human context
  jockey TEXT,
  weight REAL,
  hp REAL,

  -- Raw/final pre-race market
  final_agf REAL,

  -- Compact form representation
  recent_form_raw TEXT,
  form_score REAL,

  -- Market feature engineering
  market_score REAL,
  agf_t90 REAL,
  agf_t30 REAL,
  agf_t5 REAL,
  agf_final REAL,
  agf_max_rise REAL,
  agf_max_fall REAL,

  -- Expert information
  expert_score REAL,
  expert_source_count INTEGER,
  expert_banko_count INTEGER NOT NULL DEFAULT 0,
  expert_favorite_count INTEGER NOT NULL DEFAULT 0,
  expert_rival_count INTEGER NOT NULL DEFAULT 0,
  expert_surprise_count INTEGER NOT NULL DEFAULT 0,

  -- Exact-condition / saha
  field_score REAL,

  -- Frozen prediction produced before result
  model_score REAL,
  model_confidence REAL,

  -- Official TJK label: NULL until result acquisition
  finish_position INTEGER,

  snapshot_at TEXT NOT NULL,
  labelled_at TEXT,

  PRIMARY KEY (
    race_date,
    city,
    race_number,
    horse_number
  ),

  FOREIGN KEY (
    race_date,
    city,
    race_number
  )
  REFERENCES learning_races(
    race_date,
    city,
    race_number
  )
);

CREATE INDEX IF NOT EXISTS
idx_learning_runner_horse
ON learning_runner_features(
  horse_name,
  race_date
);

CREATE INDEX IF NOT EXISTS
idx_learning_runner_jockey
ON learning_runner_features(
  jockey,
  race_date
);

CREATE INDEX IF NOT EXISTS
idx_learning_runner_result
ON learning_runner_features(
  finish_position,
  race_date
);

-- Official result acquisition state.
CREATE TABLE IF NOT EXISTS official_result_runs (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,

  last_attempt_at TEXT,
  last_success_at TEXT,

  method TEXT,
  status TEXT,
  detail TEXT,

  PRIMARY KEY(
    race_date,
    city
  )
);

-- Aggregated learning priors.
-- These are deliberately separated from raw race observations.
CREATE TABLE IF NOT EXISTS horse_learning_priors (
  horse_name TEXT PRIMARY KEY,

  sample_size INTEGER NOT NULL DEFAULT 0,
  win_rate REAL,
  top3_rate REAL,
  avg_finish REAL,

  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jockey_learning_priors (
  jockey TEXT PRIMARY KEY,

  sample_size INTEGER NOT NULL DEFAULT 0,
  win_rate REAL,
  top3_rate REAL,
  avg_finish REAL,

  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expert_learning_priors (
  source_key TEXT PRIMARY KEY,

  sample_size INTEGER NOT NULL DEFAULT 0,
  winner_hit_rate REAL,
  top3_hit_rate REAL,

  updated_at TEXT NOT NULL
);
