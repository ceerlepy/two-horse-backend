CREATE TABLE IF NOT EXISTS expert_source_refresh_trace (
  source_key TEXT PRIMARY KEY,
  phase TEXT NOT NULL,
  current_url TEXT,
  details_json TEXT,
  started_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expert_refresh_trace_updated
ON expert_source_refresh_trace(updated_at);
