CREATE TABLE IF NOT EXISTS horse_video_cache (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  videos_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(race_date, city, race_number, horse_number)
);
