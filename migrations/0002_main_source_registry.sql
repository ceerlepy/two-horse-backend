CREATE TABLE IF NOT EXISTS main_source_registry (
  source_key TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  domain TEXT NOT NULL,

  homepage_url TEXT NOT NULL,
  last_working_url TEXT,
  last_working_url_pattern TEXT,

  health_status TEXT NOT NULL DEFAULT 'unknown',

  last_success_at TEXT,
  last_failure_at TEXT,
  last_discovered_at TEXT,

  discovery_confidence REAL NOT NULL DEFAULT 0.50,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO main_source_registry (
  source_key,
  source_name,
  domain,
  homepage_url,
  last_working_url,
  last_working_url_pattern,
  health_status,
  discovery_confidence
)
VALUES (
  'tjk_program',
  'TJK Günlük Yarış Programı',
  'tjk.org',
  'https://www.tjk.org/TR/YarisSever',
  'https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami',
  '/TR/YarisSever/Info/Page/GunlukYarisProgrami',
  'healthy',
  1.0
);
