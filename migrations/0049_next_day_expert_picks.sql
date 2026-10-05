-- Early expert picks for tomorrow's (D+1) card, shown on the
-- next-day card as a count only ("N uzman"). Deliberately separate
-- from expert_predictions/source_registry: today's expert tables,
-- scoring, coupons and learning never read these rows. Rows are
-- matched against next_day_programs (not meetings/races/runners)
-- and pruned once their race_date is in the past.
CREATE TABLE IF NOT EXISTS next_day_expert_picks (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  source_key TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_banko INTEGER NOT NULL DEFAULT 0,
  is_strong INTEGER NOT NULL DEFAULT 0,
  is_star INTEGER NOT NULL DEFAULT 0,
  is_rival INTEGER NOT NULL DEFAULT 0,
  is_surprise INTEGER NOT NULL DEFAULT 0,
  is_avoid INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_rank INTEGER,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (race_date, city, race_number, horse_number, source_key)
);

CREATE INDEX IF NOT EXISTS idx_next_day_expert_picks_date
  ON next_day_expert_picks(race_date);

-- Per (source, D+1) bookkeeping: the content hash of the last
-- extracted document bundle (unchanged hash => no Workers AI call)
-- and when the source was last checked (cadence gate).
CREATE TABLE IF NOT EXISTS next_day_expert_state (
  source_key TEXT NOT NULL,
  race_date TEXT NOT NULL,
  content_hash TEXT,
  status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_key, race_date)
);
