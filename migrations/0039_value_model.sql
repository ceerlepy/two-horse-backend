-- Value model ("AGF'nin hafife aldığı at"): a separate, AGF-anchored opinion
-- shown next to the existing score. Nothing here is read by the existing
-- scoring, learning or coupon code. See docs/ARCHITECTURE-DEEP-DIVE.md §71.

-- One row per domestic race, parsed from TJK's daily result city pages.
CREATE TABLE IF NOT EXISTS result_archive_races (
  race_code INTEGER PRIMARY KEY,
  race_date TEXT NOT NULL,
  city_id INTEGER NOT NULL,
  race_number INTEGER NOT NULL,
  distance_meters INTEGER,
  surface TEXT,
  breed TEXT,
  going TEXT,
  class_text TEXT,
  prize1 INTEGER,
  market_ok INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_result_archive_races_date
  ON result_archive_races(race_date, city_id);

-- One row per starter (scratched horses are not stored).
-- p_win: final ganyan odds normalised within the race (NULL when the race
-- has incomplete odds). fig: track-variant-adjusted speed figure.
CREATE TABLE IF NOT EXISTS result_archive_runners (
  race_code INTEGER NOT NULL,
  race_date TEXT NOT NULL,
  horse_id INTEGER NOT NULL,
  horse_number INTEGER,
  finish_position INTEGER,
  time_sec REAL,
  ganyan REAL,
  agf_percent REAL,
  p_win REAL,
  jockey_id INTEGER,
  trainer_id INTEGER,
  weight REAL,
  hp INTEGER,
  fig REAL,
  PRIMARY KEY (race_code, horse_id)
);
CREATE INDEX IF NOT EXISTS idx_result_archive_runners_horse
  ON result_archive_runners(horse_id, race_date);
CREATE INDEX IF NOT EXISTS idx_result_archive_runners_jockey
  ON result_archive_runners(jockey_id, race_date);

-- Which dates have been archived (backfill cursor and daily progress).
CREATE TABLE IF NOT EXISTS result_archive_dates (
  race_date TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  meetings INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

-- Latest training gallops per horse (TJK İdman İstatistikleri).
CREATE TABLE IF NOT EXISTS horse_gallops (
  horse_id INTEGER NOT NULL,
  gallop_date TEXT NOT NULL,
  hippodrome TEXT NOT NULL DEFAULT '',
  surface TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  effort TEXT NOT NULL DEFAULT '',
  splits_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (horse_id, gallop_date, hippodrome, surface, kind)
);
CREATE TABLE IF NOT EXISTS horse_gallop_state (
  horse_id INTEGER PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0
);

-- Pre-race ganyan odds from TJK muhtemeller, one row per change.
CREATE TABLE IF NOT EXISTS ganyan_odds_snapshots (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  odds REAL,
  scratched INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT NOT NULL,
  PRIMARY KEY (race_date, city, race_number, horse_number, captured_at)
);

CREATE TABLE IF NOT EXISTS ganyan_odds_polls (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  polled_at TEXT NOT NULL,
  PRIMARY KEY (race_date, city, race_number)
);

-- Value-model output per runner. Rows stop updating at the off
-- (frozen_at), so labelled rows are honest out-of-sample predictions.
-- features_json is a compact array in VALUE_MODEL_FEATURES order.
CREATE TABLE IF NOT EXISTS value_model_predictions (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  horse_id INTEGER,
  race_code INTEGER,
  variant TEXT NOT NULL,
  model_version TEXT NOT NULL,
  p_model REAL NOT NULL,
  p_agf REAL,
  p_ganyan REAL,
  odds REAL,
  value_ratio REAL,
  features_json TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  frozen_at TEXT,
  finish_position INTEGER,
  final_ganyan REAL,
  PRIMARY KEY (race_date, city, race_number, horse_number)
);
CREATE INDEX IF NOT EXISTS idx_value_model_predictions_label
  ON value_model_predictions(frozen_at, finish_position);

-- Single-row state: gate status, live evaluation, retrained coefficients.
CREATE TABLE IF NOT EXISTS value_model_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'active',
  status_reason TEXT,
  evaluated_at TEXT,
  evaluation_json TEXT,
  coefficients_json TEXT,
  coefficients_version TEXT,
  retrained_at TEXT,
  retrain_json TEXT
);
INSERT OR IGNORE INTO value_model_state(id, status) VALUES (1, 'active');
