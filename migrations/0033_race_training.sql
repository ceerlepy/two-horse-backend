-- TJK "İdman Bilgileri" per race: each runner's latest training gallop.
-- Source: /TR/YarisSever/Info/Karsilastirma/Karsilastirma?KosuKodu=..&KTip=5
CREATE TABLE IF NOT EXISTS race_training (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  horse_number INTEGER NOT NULL,
  horse_name TEXT NOT NULL,
  training_date TEXT,
  track TEXT,
  track_condition TEXT,
  training_type TEXT,
  hippodrome TEXT,
  training_jockey TEXT,
  splits_json TEXT NOT NULL DEFAULT '[]',
  detail_url TEXT,
  video_url TEXT,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(race_date, city, race_number, horse_number)
);

CREATE TABLE IF NOT EXISTS race_training_state (
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  race_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  PRIMARY KEY(race_date, city, race_number)
);
