-- Parsed Banko Tahminler AI picks per foreign meeting
-- (src/foreign/banko-picks.ts). Raw HTML is no longer kept; the
-- _index/_sample diagnostic rows from 0041's era are dropped.
ALTER TABLE foreign_expert_pages ADD COLUMN picks_json TEXT;
DELETE FROM foreign_expert_pages;
