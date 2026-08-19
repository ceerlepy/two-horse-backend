ALTER TABLE runners
ADD COLUMN horse_profile_url TEXT;

CREATE TABLE IF NOT EXISTS horse_form_history (
  horse_key TEXT NOT NULL,
  horse_name TEXT NOT NULL,

  race_date TEXT NOT NULL,
  city TEXT,
  distance_meters INTEGER,
  track TEXT,

  finish_position INTEGER,
  weight REAL,
  jockey TEXT,
  odds REAL,
  hp INTEGER,

  source_url TEXT NOT NULL,

  fetched_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (
    horse_key,
    race_date,
    city,
    distance_meters
  )
);

CREATE INDEX IF NOT EXISTS
idx_horse_form_history_lookup
ON horse_form_history(
  horse_key,
  race_date DESC
);
