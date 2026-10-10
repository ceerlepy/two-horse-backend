-- Winners of races that already finished today, read from TJK's
-- result page while the meeting is still running, so "Kuponlarım"
-- can mark each leg ~10 minutes after its race instead of waiting
-- for the full official ingest 45 minutes after the last race.
-- Learning labels still come only from the official ingest.
CREATE TABLE IF NOT EXISTS live_race_winners (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (race_date, city, race_number)
);

CREATE TABLE IF NOT EXISTS live_winner_runs (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  PRIMARY KEY (race_date, city)
);
