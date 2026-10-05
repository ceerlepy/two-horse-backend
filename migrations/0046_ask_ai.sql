-- "AI'ya sor": one row per distinct question (race + language + text)
-- a user asked on a Turkey calendar day. Asking the same question
-- again does not add a row, so it does not use the daily allowance.
-- billed counts the answers that needed a paid Workers AI call (cache
-- hits add 0); its daily sum enforces the global spending cap.
CREATE TABLE IF NOT EXISTS ask_ai_log (
  user_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  question_key TEXT NOT NULL,
  billed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, usage_date, question_key)
);

CREATE INDEX IF NOT EXISTS idx_ask_ai_log_date
  ON ask_ai_log (usage_date);
