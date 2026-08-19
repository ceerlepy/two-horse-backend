CREATE TABLE IF NOT EXISTS expert_category_priors (
  source_key TEXT NOT NULL,
  category TEXT NOT NULL,

  sample_size INTEGER NOT NULL,
  winner_hit_rate REAL NOT NULL,
  top3_hit_rate REAL NOT NULL,

  multiplier REAL NOT NULL DEFAULT 1.0,
  updated_at TEXT NOT NULL,

  PRIMARY KEY(source_key, category)
);

CREATE INDEX IF NOT EXISTS idx_expert_category_prior_lookup
ON expert_category_priors(source_key, category);

CREATE TABLE IF NOT EXISTS learning_advanced_metrics (
  id INTEGER PRIMARY KEY CHECK(id = 1),

  evaluated_races INTEGER NOT NULL DEFAULT 0,

  base_mrr REAL,
  learned_mrr REAL,

  base_top5_rate REAL,
  learned_top5_rate REAL,

  avg_abs_learning_adjustment REAL,

  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO learning_advanced_metrics(
  id,
  updated_at
)
VALUES(
  1,
  CURRENT_TIMESTAMP
);
