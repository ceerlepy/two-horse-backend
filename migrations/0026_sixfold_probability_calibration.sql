CREATE TABLE IF NOT EXISTS sixfold_leg_calibration_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  snapshot_id INTEGER NOT NULL,
  race_number INTEGER NOT NULL,

  predicted_probability REAL NOT NULL,
  hit INTEGER NOT NULL,

  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS
idx_sixfold_calibration_recorded
ON sixfold_leg_calibration_samples(
  recorded_at
);

CREATE TABLE IF NOT EXISTS sixfold_probability_calibration (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  sample_count INTEGER NOT NULL DEFAULT 0,
  predicted_avg_coverage REAL,
  actual_hit_rate REAL,

  temperature REAL NOT NULL,
  status TEXT NOT NULL,

  updated_at TEXT NOT NULL
);
