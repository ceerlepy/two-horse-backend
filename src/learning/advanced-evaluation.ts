import type {
  Env
} from "../env";


export async function evaluateAdvancedLearning(
  env: Env
): Promise<void> {
  const row =
    await env.DB.prepare(`
      WITH winner_ranks AS (
        SELECT
          w.race_date,
          w.city,
          w.race_number,

          1 + (
            SELECT COUNT(*)
            FROM learning_runner_features x

            WHERE
              x.race_date =
                w.race_date
              AND x.city =
                w.city
              AND x.race_number =
                w.race_number
              AND x.finish_position > 0
              AND x.base_model_score >
                  w.base_model_score
          ) base_rank,

          1 + (
            SELECT COUNT(*)
            FROM learning_runner_features x

            WHERE
              x.race_date =
                w.race_date
              AND x.city =
                w.city
              AND x.race_number =
                w.race_number
              AND x.finish_position > 0
              AND x.model_score >
                  w.model_score
          ) learned_rank

        FROM learning_runner_features w

        WHERE
          w.finish_position = 1
          AND w.base_model_score
              IS NOT NULL
          AND w.model_score
              IS NOT NULL
      ),

      race_eval AS (
        SELECT
          race_date,
          city,
          race_number,

          MIN(base_rank)
            base_rank,

          MIN(learned_rank)
            learned_rank

        FROM winner_ranks

        GROUP BY
          race_date,
          city,
          race_number
      ),

      adjustment_stats AS (
        SELECT
          AVG(
            ABS(
              COALESCE(
                learning_adjustment,
                0
              )
            )
          ) avg_adjustment

        FROM learning_runner_features

        WHERE
          finish_position
            IS NOT NULL
      )

      SELECT
        COUNT(*) evaluated_races,

        AVG(
          1.0 / base_rank
        ) base_mrr,

        AVG(
          1.0 / learned_rank
        ) learned_mrr,

        AVG(
          CASE
            WHEN base_rank <= 5
            THEN 1.0
            ELSE 0.0
          END
        ) base_top5,

        AVG(
          CASE
            WHEN learned_rank <= 5
            THEN 1.0
            ELSE 0.0
          END
        ) learned_top5,

        (
          SELECT avg_adjustment
          FROM adjustment_stats
        ) avg_adjustment

      FROM race_eval
    `)
      .first<any>();

  await env.DB.prepare(`
    UPDATE learning_advanced_metrics

    SET
      evaluated_races = ?,
      base_mrr = ?,
      learned_mrr = ?,
      base_top5_rate = ?,
      learned_top5_rate = ?,
      avg_abs_learning_adjustment = ?,
      updated_at = ?

    WHERE id = 1
  `)
    .bind(
      Number(
        row?.evaluated_races ??
        0
      ),

      row?.base_mrr ??
      null,

      row?.learned_mrr ??
      null,

      row?.base_top5 ??
      null,

      row?.learned_top5 ??
      null,

      row?.avg_adjustment ??
      null,

      new Date()
        .toISOString()
    )
    .run();
}
