-- Value model monthly refit from the result archive (docs §71.3).
-- One row per archived starter in a market race: the same pre-race features
-- the live model computes, as of that race date, with the final market.
CREATE TABLE IF NOT EXISTS value_model_training_rows (
  race_code INTEGER NOT NULL,
  horse_id INTEGER NOT NULL,
  race_date TEXT NOT NULL,
  variant TEXT NOT NULL,
  p_agf REAL,
  p_ganyan REAL,
  won INTEGER NOT NULL,
  features_json TEXT NOT NULL,
  PRIMARY KEY (race_code, horse_id)
);
CREATE INDEX IF NOT EXISTS idx_value_model_training_rows_date
  ON value_model_training_rows(race_date);

-- Which archive dates have training rows, and with which feature version.
CREATE TABLE IF NOT EXISTS value_model_training_dates (
  race_date TEXT PRIMARY KEY,
  races INTEGER NOT NULL,
  feature_version INTEGER NOT NULL,
  built_at TEXT NOT NULL
);
