ALTER TABLE races
ADD COLUMN fivefold_start_numbers_json TEXT;

CREATE TABLE IF NOT EXISTS fivefold_windows (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  fivefold_number INTEGER NOT NULL,
  start_race INTEGER NOT NULL,
  end_race INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  PRIMARY KEY(
    race_date,
    city,
    fivefold_number
  )
);

CREATE TABLE IF NOT EXISTS fivefold_coupon_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  fivefold_number INTEGER NOT NULL,
  profile TEXT NOT NULL,

  start_race INTEGER NOT NULL,
  end_race INTEGER NOT NULL,

  budget_tl REAL NOT NULL,
  total_tl REAL NOT NULL,
  combinations INTEGER NOT NULL,
  unit_price_tl REAL NOT NULL,
  multiplier INTEGER NOT NULL,

  selections_json TEXT NOT NULL,

  estimated_survival_probability REAL,

  generated_at TEXT NOT NULL,
  evaluated_at TEXT,
  snapshot_key TEXT,
  unresolved_reason TEXT,

  hit_legs INTEGER,
  five_of_five INTEGER,
  four_of_five INTEGER,

  UNIQUE(
    race_date,
    city,
    fivefold_number,
    profile,
    generated_at
  )
);

CREATE INDEX IF NOT EXISTS
idx_fivefold_coupon_eval
ON fivefold_coupon_snapshots(
  race_date,
  city,
  evaluated_at
);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_fivefold_coupon_snapshot_key
ON fivefold_coupon_snapshots(
  snapshot_key
)
WHERE snapshot_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS fivefold_leg_calibration_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER NOT NULL,
  race_number INTEGER NOT NULL,
  predicted_probability REAL NOT NULL,
  hit INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fivefold_calibration_recorded ON fivefold_leg_calibration_samples(recorded_at);

CREATE TABLE IF NOT EXISTS fivefold_probability_calibration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sample_count INTEGER NOT NULL DEFAULT 0,
  predicted_avg_coverage REAL,
  actual_hit_rate REAL,
  temperature REAL NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
