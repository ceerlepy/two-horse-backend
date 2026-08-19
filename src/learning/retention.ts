import type {
  Env
} from "../env";


/*
 * Retention policy
 * ----------------
 *
 * KEEP LONG TERM:
 * - normalized labelled race features
 * - official finish labels
 * - compact horse/jockey priors
 *
 * DO NOT duplicate/store forever:
 * - raw HTML
 * - browser output
 * - CF scrape/content payloads
 * - transient source diagnostics
 *
 * Current normalized learning rows are deliberately
 * retained: they are small and are the valuable
 * training dataset.
 */
export async function cleanupLearning(
  env: Env
): Promise<void> {
  /*
   * Remove acquisition state after 30 days.
   * It is operational telemetry, not training data.
   */
  await env.DB.exec(`
    DELETE FROM official_result_runs
    WHERE
      last_attempt_at <
      datetime(
        'now',
        '-30 days'
      );
  `);
}
