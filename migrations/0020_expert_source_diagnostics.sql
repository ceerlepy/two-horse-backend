ALTER TABLE source_registry
ADD COLUMN last_discovered_from_url TEXT;

ALTER TABLE source_registry
ADD COLUMN last_discovery_method TEXT;

ALTER TABLE source_registry
ADD COLUMN last_extraction_method TEXT;
