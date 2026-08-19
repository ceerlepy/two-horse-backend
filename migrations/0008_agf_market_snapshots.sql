CREATE TABLE IF NOT EXISTS agf_market_snapshots (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,

  agf_percent REAL NOT NULL,
  captured_at TEXT NOT NULL,

  PRIMARY KEY (
    race_date,
    city,
    race_number,
    horse_number,
    captured_at
  )
);

CREATE INDEX IF NOT EXISTS
idx_agf_market_runner
ON agf_market_snapshots(
  race_date,
  city,
  race_number,
  horse_number,
  captured_at
);

CREATE INDEX IF NOT EXISTS
idx_agf_market_cleanup
ON agf_market_snapshots(
  race_date
);
