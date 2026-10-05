-- Value model v2: start (gate) position. The market under-prices draw
-- bias in sprints (docs/ARCHITECTURE-DEEP-DIVE.md §71.1).
ALTER TABLE runners ADD COLUMN start_position INTEGER;
ALTER TABLE result_archive_runners ADD COLUMN start_position INTEGER;
-- Dates archived before start_position existed are re-fetched (revision 2).
ALTER TABLE result_archive_dates ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
-- Small computed caches (draw-bias cells per race date).
CREATE TABLE IF NOT EXISTS value_model_cache (
  cache_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
