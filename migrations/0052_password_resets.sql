-- One pending password-reset code per email. Only a hash of the
-- 6-digit code is stored; a code lives 15 minutes and allows 5 tries.
CREATE TABLE IF NOT EXISTS password_reset_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
