export interface Env {
  AI: Ai;
  BROWSER: BrowserRun;
  DB: D1Database;
  APP_NAME: string;
  APP_VERSION: string;
  AI_MODEL?: string;
  ADMIN_TOKEN?: string;
  LOG_LEVEL?: string;
  LOG_DEBUG_SAMPLE_RATE?: string;

  /*
   * Membership / auth secrets. All optional so the worker still
   * boots in an environment where they have not been configured
   * yet -- the affected endpoints fail closed (503) instead of
   * the whole worker failing to start.
   */
  SESSION_JWT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  PLAY_PACKAGE_NAME?: string;
}
