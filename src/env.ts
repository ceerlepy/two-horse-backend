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
}
