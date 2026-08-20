CREATE TABLE IF NOT EXISTS sixfold_windows (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  sixfold_number INTEGER NOT NULL,
  start_race INTEGER NOT NULL,
  end_race INTEGER NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  PRIMARY KEY(
    race_date,
    city,
    sixfold_number
  )
);

CREATE TABLE IF NOT EXISTS sixfold_coupon_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  sixfold_number INTEGER NOT NULL,
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

  hit_legs INTEGER,
  six_of_six INTEGER,
  five_of_six INTEGER,

  UNIQUE(
    race_date,
    city,
    sixfold_number,
    profile,
    generated_at
  )
);

CREATE INDEX IF NOT EXISTS
idx_sixfold_coupon_eval
ON sixfold_coupon_snapshots(
  race_date,
  city,
  evaluated_at
);
