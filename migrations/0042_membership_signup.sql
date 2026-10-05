-- Email/password self-registration and account deletion.
--
-- email_verified: 1 when the address is proven (Google sign-in, or
-- rows created before self-registration existed); 0 for accounts
-- registered with email + password. When a Google sign-in later
-- proves an unverified address, the password is dropped so a
-- stranger who pre-registered someone else's email can't keep a
-- way into that account.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;

-- One-way SHA-256 hashes of identities (email / Google subject)
-- that already used their free trial and then deleted the account.
-- Keeps "delete and re-register" from minting a fresh trial without
-- retaining the email itself.
CREATE TABLE IF NOT EXISTS trial_claims (
  identity_hash TEXT PRIMARY KEY,
  claimed_at TEXT NOT NULL
);
