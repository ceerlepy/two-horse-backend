CREATE TABLE IF NOT EXISTS horse_form_refresh_state (
  horse_key TEXT PRIMARY KEY,
  horse_name TEXT NOT NULL,
  source_url TEXT NOT NULL,

  status TEXT NOT NULL
    DEFAULT 'pending',

  acquisition_method TEXT,

  last_attempt_at TEXT,
  last_success_at TEXT,

  consecutive_failures INTEGER NOT NULL
    DEFAULT 0,

  last_error TEXT,

  updated_at TEXT NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS
idx_horse_form_refresh_due
ON horse_form_refresh_state(
  last_success_at,
  consecutive_failures
);
