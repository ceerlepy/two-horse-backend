ALTER TABLE learning_races
ADD COLUMN model_version TEXT;

ALTER TABLE learning_races
ADD COLUMN learning_policy_version TEXT;

ALTER TABLE learning_races
ADD COLUMN coupon_policy_version TEXT;

ALTER TABLE learning_races
ADD COLUMN coupon_mode TEXT;

ALTER TABLE learning_races
ADD COLUMN coupon_horse_numbers_json TEXT;

ALTER TABLE learning_races
ADD COLUMN coupon_confidence REAL;

ALTER TABLE learning_races
ADD COLUMN coupon_expansion_pressure REAL;

ALTER TABLE learning_races
ADD COLUMN coupon_reason TEXT;


CREATE TABLE IF NOT EXISTS coupon_strategy_metrics (
  mode TEXT PRIMARY KEY,

  evaluated_races INTEGER NOT NULL DEFAULT 0,
  winner_covered_races INTEGER NOT NULL DEFAULT 0,

  hit_rate REAL,
  avg_selection_count REAL,

  updated_at TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS learning_label_audit (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,

  attempted_at TEXT NOT NULL,

  reason TEXT NOT NULL,

  frozen_runner_count INTEGER,
  official_runner_count INTEGER,

  detail TEXT,

  PRIMARY KEY(
    race_date,
    city,
    race_number,
    attempted_at
  )
);

CREATE INDEX IF NOT EXISTS
idx_learning_label_audit_recent
ON learning_label_audit(
  attempted_at,
  reason
);
