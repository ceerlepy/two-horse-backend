-- Discovery evidence and verified working evidence are
-- intentionally separate concepts.
--
-- last_discovered_article_url:
--   latest article URL accepted by source-aware discovery.
--
-- This field may be written before extraction succeeds.
--
-- last_working_url remains stronger:
--   only a URL that produced current canonical TJK picks
--   and successfully persisted them becomes working.

ALTER TABLE source_registry
ADD COLUMN last_discovered_article_url TEXT;

ALTER TABLE source_registry
ADD COLUMN last_discovered_article_at TEXT;
