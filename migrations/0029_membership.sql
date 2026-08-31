CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,

  email TEXT NOT NULL UNIQUE,
  display_name TEXT,

  google_sub TEXT UNIQUE,
  password_hash TEXT,

  tier TEXT NOT NULL DEFAULT 'free'
    CHECK(tier IN ('free','gold','premium')),

  tier_source TEXT NOT NULL DEFAULT 'trial'
    CHECK(tier_source IN ('trial','play_subscription','manual')),

  trial_started_at TEXT,
  trial_ends_at TEXT,

  subscription_product_id TEXT,
  subscription_expires_at TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_users_google_sub
ON users(google_sub)
WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS play_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),

  product_id TEXT NOT NULL,
  purchase_token TEXT NOT NULL UNIQUE,
  order_id TEXT,

  raw_status TEXT NOT NULL,
  expiry_time_millis INTEGER,

  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS
idx_play_purchases_user
ON play_purchases(user_id);
