-- Gold's daily coupon allowance: one row per distinct coupon request
-- (city + pool + window + budget) a user made on a Turkey calendar day.
-- Repeating a request already made that day does not add a row.
CREATE TABLE IF NOT EXISTS coupon_request_log (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  request_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date, request_key)
);
