-- Official finishing order of foreign (YD) races, read from TJK's daily
-- results page. Kept apart from the domestic learning tables for the
-- same reason as foreign_meetings (0034): nothing domestic is built or
-- calibrated for these cards. Lets "Kuponlarım" score a saved foreign
-- coupon; foreign_meetings itself only keeps two days.
CREATE TABLE IF NOT EXISTS foreign_results (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  horse_name TEXT NOT NULL,
  -- 0 = did not finish / not placed, as TJK prints it.
  finish_position INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(race_date, city, race_number, horse_number)
);
