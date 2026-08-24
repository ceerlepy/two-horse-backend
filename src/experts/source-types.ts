export interface ExpertSource {
  source_key:
    string;

  source_name:
    string;

  homepage_url:
    string | null;

  /*
   * Verified working URL.
   *
   * Only canonical persistence success earns this field.
   */
  last_working_url:
    string | null;

  /*
   * Discovery evidence.
   *
   * These do NOT imply extraction succeeded.
   */
  last_discovered_article_url?:
    string | null;

  last_discovered_article_at?:
    string | null;

  content_hash:
    string | null;

  last_checked_at:
    string | null;

  last_success_at?:
    string | null;

  last_failure_at?:
    string | null;

  consecutive_failures?:
    number;

  source_type:
    string;

  base_weight:
    number;
}


export interface ExpertRefreshResult {
  source:
    string;

  status:
    | "updated"
    | "unchanged"
    | "failed"
    | "no-url"
    | "no-current-card"
    | "article-not-published"
    | "no-upcoming-race"
    | "backoff";

  count?:
    number;

  extractionMethod?:
    string;

  error?:
    string;

  retryAfterMs?:
    number;

  workingUrl?:
    string;

  attempts?:
    any[];
}
