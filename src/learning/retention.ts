import type {
  Env
} from "../env";


/*
 * D1's exec() splits its input on newlines and runs each line as a
 * separate statement, so the previous multi-line, commented SQL
 * passed to exec() failed on every cron tick and nothing was ever
 * deleted (live D1 on 2026-10-04 still held official_result_runs
 * rows last attempted on 2026-08-21). Prepared statements in a
 * batch run atomically and do not depend on line layout.
 */
export async function cleanupLearning(
  env: Env
): Promise<void> {
  await env.DB.batch([
    /*
     * Operational result diagnostics.
     */
    env.DB.prepare(`
      DELETE FROM official_result_runs
      WHERE last_attempt_at < ?
    `)
      .bind(
        new Date(
          Date.now() -
          30 * 86_400_000
        ).toISOString()
      ),

    /*
     * Safety cleanup only.
     *
     * Normally candidates are deleted immediately after
     * successful promotion.
     */
    env.DB.prepare(`
      DELETE FROM learning_snapshot_candidates
      WHERE starts_at < ?
    `)
      .bind(
        new Date(
          Date.now() -
          3 * 86_400_000
        ).toISOString()
      )
  ]);
}
