ALTER TABLE source_registry ADD COLUMN content_hash TEXT;
ALTER TABLE source_registry ADD COLUMN last_checked_at TEXT;

CREATE TABLE IF NOT EXISTS refresh_state (
 pipeline_key TEXT PRIMARY KEY,
 last_success_at TEXT,
 last_attempt_at TEXT,
 next_allowed_at TEXT,
 failure_count INTEGER NOT NULL DEFAULT 0,
 lease_until TEXT,
 last_error TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
 race_date TEXT NOT NULL,
 city TEXT NOT NULL,
 source_hash TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(race_date,city)
);

CREATE TABLE IF NOT EXISTS races (
 race_date TEXT NOT NULL, city TEXT NOT NULL, race_number INTEGER NOT NULL,
 start_time TEXT, starts_at TEXT, distance_meters INTEGER, track TEXT, finalized_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(race_date,city,race_number)
);
CREATE INDEX IF NOT EXISTS idx_races_upcoming ON races(race_date,starts_at);

CREATE TABLE IF NOT EXISTS runners (
 race_date TEXT NOT NULL, city TEXT NOT NULL, race_number INTEGER NOT NULL, horse_number INTEGER NOT NULL,
 horse_name TEXT NOT NULL, jockey TEXT, weight REAL, hp INTEGER, agf_percent REAL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(race_date,city,race_number,horse_number)
);

CREATE TABLE IF NOT EXISTS expert_predictions (
 race_date TEXT NOT NULL, city TEXT NOT NULL, race_number INTEGER NOT NULL, horse_number INTEGER NOT NULL, source_key TEXT NOT NULL,
 horse_name TEXT NOT NULL, comment TEXT, is_favorite INTEGER NOT NULL DEFAULT 0, is_banko INTEGER NOT NULL DEFAULT 0,
 is_strong INTEGER NOT NULL DEFAULT 0, is_star INTEGER NOT NULL DEFAULT 0, source_rank INTEGER, confidence REAL NOT NULL DEFAULT 0,
 content_hash TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(race_date,city,race_number,horse_number,source_key)
);
CREATE INDEX IF NOT EXISTS idx_expert_race ON expert_predictions(race_date,city,race_number);

CREATE TABLE IF NOT EXISTS race_history (
 race_date TEXT NOT NULL, city TEXT NOT NULL, race_number INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL, finalized_at TEXT NOT NULL,
 PRIMARY KEY(race_date,city,race_number)
);
