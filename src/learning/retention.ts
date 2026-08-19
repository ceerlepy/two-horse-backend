import type {
  Env
} from "../env";


export async function cleanupLearning(
  env: Env
): Promise<void> {
  await env.DB.exec(`
    /*
     * Operational result diagnostics.
     */
    DELETE FROM official_result_runs

    WHERE
      last_attempt_at <
        datetime(
          'now',
          '-30 days'
        );

    /*
     * Safety cleanup only.
     *
     * Normally candidates are deleted immediately after
     * successful promotion.
     */
    DELETE FROM learning_snapshot_candidates

    WHERE
      starts_at <
        datetime(
          'now',
          '-3 days'
        );
  `);
}
