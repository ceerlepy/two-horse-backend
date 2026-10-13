-- Which win model serves today's races (src/win-model/registry.ts).
-- One row; the weekly check flips active_model and keeps the old id.
CREATE TABLE IF NOT EXISTS win_model_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_model TEXT NOT NULL,
  previous_model TEXT,
  reason TEXT,
  changed_at TEXT
);

-- Owner's decision 2026-10-13: serve the single model, legacy kept as the way back.
INSERT OR IGNORE INTO win_model_state (id, active_model, previous_model, reason, changed_at)
VALUES (1, 'unified', 'legacy', 'Tek model: canli 493 yarista log-loss 1.8547 vs 1.8685 (owner approved 2026-10-13)', '2026-10-13T22:00:00Z');
