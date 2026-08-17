CREATE TABLE IF NOT EXISTS source_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  homepage_url TEXT,
  last_working_url TEXT,
  last_working_url_pattern TEXT,
  last_discovered_at TEXT,
  discovery_confidence REAL,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  last_success_at TEXT,
  last_failure_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS source_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  race_id TEXT,
  city TEXT,
  race_number INTEGER,
  status TEXT NOT NULL,
  discovered_url TEXT,
  extraction_method TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  FOREIGN KEY (source_key) REFERENCES source_registry(source_key)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id TEXT,
  source_key TEXT NOT NULL,
  anomaly_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  raw_payload TEXT,
  evidence TEXT,
  model_name TEXT,
  prompt_version TEXT,
  schema_version TEXT,
  discovery_confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_source_runs_race
ON source_runs(race_id);

CREATE INDEX IF NOT EXISTS idx_source_runs_source
ON source_runs(source_key);

CREATE INDEX IF NOT EXISTS idx_anomalies_race
ON anomalies(race_id);

CREATE INDEX IF NOT EXISTS idx_anomalies_source
ON anomalies(source_key);
