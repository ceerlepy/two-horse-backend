import type {
  Env
} from "../env";

import {
  clamp
} from "../scoring/math";


interface EvaluationRow {
  evaluated_races: number | null;

  base_top1: number | null;
  learned_top1: number | null;

  base_top3: number | null;
  learned_top3: number | null;

  base_mean_rank: number | null;
  learned_mean_rank: number | null;
}


/*
 * Every tunable for the learning health gate lives here, in one
 * place -- same pattern as EXPERT_CHECK_CADENCE_TIERS in
 * src/experts/policy.ts.
 *
 * minGateRaces: production learning stays OFF (scale 0) until the
 * shadow model has this many official race outcomes to evaluate
 * against. Shadow scoring itself still runs at scale=1 regardless,
 * evaluated independently.
 *
 * degradeThresholds / reduceThresholds: require agreement between
 * multiple metrics (a rate delta AND a mean-rank gain) before
 * throttling learning -- one noisy metric alone cannot disable it.
 * degrade is checked first and wins if both its conditions hold.
 */
export const LEARNING_GATE_CONFIG = {
  minGateRaces: 100,

  degradeThresholds: {
    top1Delta: -0.02,
    rankGain: -0.15
  },

  reduceThresholds: {
    top3Delta: -0.03,
    rankGain: -0.10
  },

  scales: {
    healthy: 1,
    degraded: 0.25,
    reduced: 0.50,
    insufficientData: 0
  }
} as const;


export interface LearningGateMetrics {
  races: number;
  baseTop1: number;
  learnedTop1: number;
  baseTop3: number;
  learnedTop3: number;
  baseRank: number;
  learnedRank: number;
}

export interface LearningGateOutcome {
  scale: number;
  status: string;
}

export function computeLearningGateOutcome(
  metrics: LearningGateMetrics
): LearningGateOutcome {
  if (
    metrics.races <
    LEARNING_GATE_CONFIG.minGateRaces
  ) {
    return {
      scale:
        LEARNING_GATE_CONFIG.scales
          .insufficientData,
      status: "insufficient-data"
    };
  }

  const top1Delta =
    metrics.learnedTop1 -
    metrics.baseTop1;

  const top3Delta =
    metrics.learnedTop3 -
    metrics.baseTop3;

  /*
   * Positive means learning improved winner rank.
   */
  const rankGain =
    metrics.baseRank -
    metrics.learnedRank;

  if (
    top1Delta <=
      LEARNING_GATE_CONFIG.degradeThresholds
        .top1Delta &&
    rankGain <=
      LEARNING_GATE_CONFIG.degradeThresholds
        .rankGain
  ) {
    return {
      scale:
        LEARNING_GATE_CONFIG.scales.degraded,
      status: "learning-degraded"
    };
  }

  if (
    top3Delta <=
      LEARNING_GATE_CONFIG.reduceThresholds
        .top3Delta &&
    rankGain <=
      LEARNING_GATE_CONFIG.reduceThresholds
        .rankGain
  ) {
    return {
      scale:
        LEARNING_GATE_CONFIG.scales.reduced,
      status: "learning-reduced"
    };
  }

  return {
    scale:
      LEARNING_GATE_CONFIG.scales.healthy,
    status: "healthy"
  };
}


export async function evaluateLearningModel(
  env: Env
): Promise<void> {
  /*
   * Evaluate only official runners.
   *
   * finish_position = 0 means scratch / did not run
   * and must not affect ranking evaluation.
   *
   * For dead-heats, the best official winner rank
   * represents the race.
   */
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
              x.race_date = w.race_date
              AND x.city = w.city
              AND x.race_number = w.race_number
              AND x.finish_position > 0
              AND x.base_model_score >
                  w.base_model_score
          ) AS base_rank,

          1 + (
            SELECT COUNT(*)
            FROM learning_runner_features x

            WHERE
              x.race_date = w.race_date
              AND x.city = w.city
              AND x.race_number = w.race_number
              AND x.finish_position > 0
              AND x.shadow_model_score >
                  w.shadow_model_score
          ) AS learned_rank

        FROM learning_runner_features w

        WHERE
          w.finish_position = 1
          AND w.base_model_score IS NOT NULL
          AND w.shadow_model_score IS NOT NULL

          AND NOT EXISTS (
            SELECT 1
            FROM learning_runner_features z

            WHERE
              z.race_date = w.race_date
              AND z.city = w.city
              AND z.race_number = w.race_number
              AND z.finish_position > 0
              AND (
                z.base_model_score IS NULL
                OR z.shadow_model_score IS NULL
              )
          )
      ),

      race_eval AS (
        SELECT
          race_date,
          city,
          race_number,

          MIN(base_rank) AS base_rank,
          MIN(learned_rank) AS learned_rank

        FROM winner_ranks

        GROUP BY
          race_date,
          city,
          race_number
      )

      SELECT
        COUNT(*) AS evaluated_races,

        AVG(
          CASE WHEN base_rank = 1
            THEN 1.0 ELSE 0.0 END
        ) AS base_top1,

        AVG(
          CASE WHEN learned_rank = 1
            THEN 1.0 ELSE 0.0 END
        ) AS learned_top1,

        AVG(
          CASE WHEN base_rank <= 3
            THEN 1.0 ELSE 0.0 END
        ) AS base_top3,

        AVG(
          CASE WHEN learned_rank <= 3
            THEN 1.0 ELSE 0.0 END
        ) AS learned_top3,

        AVG(base_rank)
          AS base_mean_rank,

        AVG(learned_rank)
          AS learned_mean_rank

      FROM race_eval
    `)
      .first<EvaluationRow>();

  const races =
    Number(
      row?.evaluated_races ??
      0
    );

  const baseTop1 =
    Number(row?.base_top1 ?? 0);

  const learnedTop1 =
    Number(row?.learned_top1 ?? 0);

  const baseTop3 =
    Number(row?.base_top3 ?? 0);

  const learnedTop3 =
    Number(row?.learned_top3 ?? 0);

  const baseRank =
    Number(
      row?.base_mean_rank ??
      0
    );

  const learnedRank =
    Number(
      row?.learned_mean_rank ??
      0
    );

  const gateOutcome =
    computeLearningGateOutcome({
      races,
      baseTop1,
      learnedTop1,
      baseTop3,
      learnedTop3,
      baseRank,
      learnedRank
    });

  const scale =
    clamp(
      gateOutcome.scale,
      0,
      1
    );

  const status =
    gateOutcome.status;

  await env.DB.prepare(`
    INSERT INTO learning_model_state(
      id,
      evaluated_races,

      base_top1_rate,
      learned_top1_rate,

      base_top3_rate,
      learned_top3_rate,

      base_mean_winner_rank,
      learned_mean_winner_rank,

      learning_scale,
      status,
      updated_at
    )
    VALUES(
      1,
      ?,?,?,?,?,?,?,
      ?,?,
      ?
    )

    ON CONFLICT(id)
    DO UPDATE SET
      evaluated_races =
        excluded.evaluated_races,

      base_top1_rate =
        excluded.base_top1_rate,

      learned_top1_rate =
        excluded.learned_top1_rate,

      base_top3_rate =
        excluded.base_top3_rate,

      learned_top3_rate =
        excluded.learned_top3_rate,

      base_mean_winner_rank =
        excluded.base_mean_winner_rank,

      learned_mean_winner_rank =
        excluded.learned_mean_winner_rank,

      learning_scale =
        excluded.learning_scale,

      status =
        excluded.status,

      updated_at =
        excluded.updated_at
  `)
    .bind(
      races,

      baseTop1,
      learnedTop1,

      baseTop3,
      learnedTop3,

      baseRank,
      learnedRank,

      scale,
      status,

      new Date()
        .toISOString()
    )
    .run();
}
