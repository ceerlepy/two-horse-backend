-- Expert source_registry provenance represents verified success.
--
-- Older pipeline versions wrote discovery/extraction fields
-- before current-card canonical validation succeeded.
--
-- Liderform currently has no verified last_working_url for the
-- affected state, so remove only those unresolved legacy fields.
--
-- A later canonical SUCCESS repopulates them truthfully.

UPDATE source_registry
SET
  last_discovered_from_url = NULL,
  last_discovery_method = NULL,
  last_extraction_method = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE
  source_key = 'liderform'
  AND last_working_url IS NULL;
