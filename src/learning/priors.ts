import type {
  Env
} from "../env";


/*
 * Rebuild compact priors only from officially-labelled
 * historical observations.
 *
 * IMPORTANT:
 * These priors are NOT yet automatically injected into
 * the live score.
 *
 * We first collect enough labelled races and evaluate
 * calibration out-of-sample.
 */
export async function rebuildLearningPriors(
  env: Env
): Promise<void> {
  const now =
    new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM horse_learning_priors
    `),

    env.DB.prepare(`
      INSERT INTO horse_learning_priors(
        horse_name,
        sample_size,
        win_rate,
        top3_rate,
        avg_finish,
        updated_at
      )

      SELECT
        horse_name,

        COUNT(*),

        AVG(
          CASE
            WHEN finish_position = 1
            THEN 1.0
            ELSE 0.0
          END
        ),

        AVG(
          CASE
            WHEN finish_position BETWEEN 1 AND 3
            THEN 1.0
            ELSE 0.0
          END
        ),

        AVG(
          CASE
            WHEN finish_position > 0
            THEN finish_position
            ELSE NULL
          END
        ),

        ?

      FROM learning_runner_features

      WHERE
        finish_position IS NOT NULL

      GROUP BY horse_name
    `).bind(now),

    env.DB.prepare(`
      DELETE FROM jockey_learning_priors
    `),

    env.DB.prepare(`
      INSERT INTO jockey_learning_priors(
        jockey,
        sample_size,
        win_rate,
        top3_rate,
        avg_finish,
        updated_at
      )

      SELECT
        jockey,

        COUNT(*),

        AVG(
          CASE
            WHEN finish_position = 1
            THEN 1.0
            ELSE 0.0
          END
        ),

        AVG(
          CASE
            WHEN finish_position BETWEEN 1 AND 3
            THEN 1.0
            ELSE 0.0
          END
        ),

        AVG(
          CASE
            WHEN finish_position > 0
            THEN finish_position
            ELSE NULL
          END
        ),

        ?

      FROM learning_runner_features

      WHERE
        finish_position IS NOT NULL
        AND jockey IS NOT NULL
        AND TRIM(jockey) <> ''

      GROUP BY jockey
    `).bind(now)
  ]);
}
