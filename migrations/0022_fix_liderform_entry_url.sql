-- Canonical Liderform runtime homepage.
UPDATE source_registry
SET
  homepage_url = 'https://liderform.com.tr/',
  updated_at = CURRENT_TIMESTAMP
WHERE source_key = 'liderform';


-- Clear only the historical stale /experts provenance.
UPDATE source_registry
SET
  last_working_url =
    CASE
      WHEN last_working_url =
        'https://liderform.com.tr/experts'
      THEN NULL
      ELSE last_working_url
    END,

  last_discovery_method =
    CASE
      WHEN last_discovered_from_url =
        'https://liderform.com.tr/experts'
      THEN NULL
      ELSE last_discovery_method
    END,

  last_extraction_method =
    CASE
      WHEN last_discovered_from_url =
        'https://liderform.com.tr/experts'
      THEN NULL
      ELSE last_extraction_method
    END,

  last_discovered_from_url =
    CASE
      WHEN last_discovered_from_url =
        'https://liderform.com.tr/experts'
      THEN NULL
      ELSE last_discovered_from_url
    END,

  updated_at = CURRENT_TIMESTAMP

WHERE source_key = 'liderform';
