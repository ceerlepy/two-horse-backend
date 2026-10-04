-- Foreign meetings TJK lists as "(YD n)" (UK, France, USA, ...).
-- Kept apart from the domestic canonical tables on purpose: expert,
-- field, learning, market and coupon pipelines all read races/runners,
-- and none of them is built or calibrated for foreign cards.
CREATE TABLE IF NOT EXISTS foreign_meetings (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT,
  yd_order INTEGER,
  program_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(race_date, city)
);
