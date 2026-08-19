CREATE TABLE IF NOT EXISTS learning_snapshot_candidates (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,

  starts_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,

  snapshot_json TEXT NOT NULL,

  PRIMARY KEY(
    race_date,
    city,
    race_number
  ),

  CHECK(
    captured_at < starts_at
  )
);

CREATE INDEX IF NOT EXISTS
idx_learning_candidates_start
ON learning_snapshot_candidates(
  starts_at,
  captured_at
);
