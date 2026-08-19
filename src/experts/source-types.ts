export interface ExpertSource {
  source_key: string;
  source_name: string;

  homepage_url: string | null;
  last_working_url: string | null;

  content_hash: string | null;
  last_checked_at: string | null;

  source_type: string;
  base_weight: number;
}

export interface ExpertRefreshResult {
  source: string;

  status:
    | "updated"
    | "unchanged"
    | "failed"
    | "no-url";

  count?: number;

  extractionMethod?: string;

  error?: string;
}
