-- Workers AI response cache.
--
-- Expert sources are re-checked many times a day (every 5-120 min
-- depending on race proximity) and usually return the exact same
-- article text. Every Workers AI call runs with temperature 0, so an
-- identical (model, prompt, schema) input always yields the same
-- answer: caching it skips the billed neurons without changing any
-- result. Rows expire after 36 hours (see cleanupAiResponseCache).
CREATE TABLE IF NOT EXISTS ai_response_cache (
  cache_key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_created
  ON ai_response_cache(created_at);
