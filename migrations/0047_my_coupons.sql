-- "Kuponlarım": coupons a member saved from the coupon screen. Each row
-- is the member's own copy; hits are worked out from results on read.
CREATE TABLE IF NOT EXISTS my_coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  race_date TEXT NOT NULL,
  city TEXT NOT NULL,
  pool TEXT NOT NULL,
  window_number INTEGER NOT NULL,
  budget_tl REAL NOT NULL,
  total_tl REAL NOT NULL,
  combinations INTEGER NOT NULL,
  selections_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, race_date, city, pool, window_number, selections_json)
);

CREATE INDEX IF NOT EXISTS idx_my_coupons_user_date
ON my_coupons (user_id, race_date);
