-- Owner decision 2026-10-04: stop scraping three sources that cannot work.
--  * yildizli_bulten: domain now redirects to an unrelated site.
--  * puanli_altili_bulten: host no longer answers; never had an adapter.
--  * yaris_analizi: daily article sits behind a VIP paywall (135 consecutive
--    failures), each attempt burning Browser Rendering time.
-- Rows stay for prediction history; enabled=0 removes them from refresh.
UPDATE source_registry
SET enabled = 0
WHERE source_key IN (
  'yildizli_bulten',
  'puanli_altili_bulten',
  'yaris_analizi'
);
