ALTER TABLE races
ADD COLUMN performance_url TEXT;

CREATE TABLE IF NOT EXISTS field_signals (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,

  tjk_score REAL,
  sample_size INTEGER NOT NULL DEFAULT 0,

  source_url TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY(
    race_date,
    city,
    race_number,
    horse_number
  )
);

CREATE TABLE IF NOT EXISTS field_refresh_state (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,

  status TEXT NOT NULL,
  acquisition_method TEXT,

  last_success_at TEXT,
  last_attempt_at TEXT,
  last_error TEXT,

  PRIMARY KEY(
    race_date,
    city,
    race_number
  )
);

CREATE INDEX IF NOT EXISTS
idx_field_signals_race
ON field_signals(
  race_date,
  city,
  race_number
);
