CREATE TABLE IF NOT EXISTS learning_model_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),

  evaluated_races INTEGER NOT NULL DEFAULT 0,

  base_top1_rate REAL,
  learned_top1_rate REAL,

  base_top3_rate REAL,
  learned_top3_rate REAL,

  base_mean_winner_rank REAL,
  learned_mean_winner_rank REAL,

  learning_scale REAL NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'insufficient-data',

  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO learning_model_state(
  id,
  learning_scale,
  status,
  updated_at
)
VALUES(
  1,
  1.0,
  'insufficient-data',
  CURRENT_TIMESTAMP
);
