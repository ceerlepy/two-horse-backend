-- Expert pages for foreign (YD) meetings, phase 1: Banko Tahminler's
-- /ai-tahmin/ page per meeting (src/foreign/banko.ts). One row per
-- meeting/source/day, 3 days kept.
CREATE TABLE IF NOT EXISTS foreign_expert_pages (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  source_key TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  html TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (race_date, city, source_key)
);
