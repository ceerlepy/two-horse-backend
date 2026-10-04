-- Puanlı Altılı Bülten is alive: it moved from the dead
-- puanlialtilibulten.com to Blogger. 0032 disabled it on the old
-- domain; point it at the new host and turn it back on. Picks are
-- read from its score tables by src/experts/adapters/puanli-altili-bulten.ts.
UPDATE source_registry
SET
  domain = 'puanlialtilibulten.blogspot.com',
  homepage_url = 'https://puanlialtilibulten.blogspot.com/',
  enabled = 1,
  health_status = 'unknown',
  consecutive_failures = 0
WHERE source_key = 'puanli_altili_bulten';
