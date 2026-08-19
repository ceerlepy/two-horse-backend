import type {
  Env
} from "../env";

import {
  clamp,
  round
} from "../scoring/math";


interface CategoryRow {
  source_key: string;
  category: string;
  sample_size: number;
  wins: number;
  top3: number;
}


const MIN_SAMPLES:
  Record<string, number> = {
    banko: 15,
    favorite: 25,
    strong: 25,
    star: 20,
    rival: 30,
    surprise: 30
  };


export async function rebuildExpertCategoryPriors(
  env: Env
): Promise<void> {
  const rows =
    await env.DB.prepare(`
      WITH category_picks AS (
        SELECT
          source_key,
          finish_position,
          'banko' category
        FROM learning_expert_picks
        WHERE is_banko = 1
          AND finish_position > 0

        UNION ALL

        SELECT
          source_key,
          finish_position,
          'favorite'
        FROM learning_expert_picks
        WHERE is_favorite = 1
          AND finish_position > 0

        UNION ALL

        SELECT
          source_key,
          finish_position,
          'strong'
        FROM learning_expert_picks
        WHERE is_strong = 1
          AND finish_position > 0

        UNION ALL

        SELECT
          source_key,
          finish_position,
          'star'
        FROM learning_expert_picks
        WHERE is_star = 1
          AND finish_position > 0

        UNION ALL

        SELECT
          source_key,
          finish_position,
          'rival'
        FROM learning_expert_picks
        WHERE is_rival = 1
          AND finish_position > 0

        UNION ALL

        SELECT
          source_key,
          finish_position,
          'surprise'
        FROM learning_expert_picks
        WHERE is_surprise = 1
          AND finish_position > 0
      )

      SELECT
        source_key,
        category,
        COUNT(*) sample_size,

        SUM(
          CASE WHEN finish_position = 1
          THEN 1 ELSE 0 END
        ) wins,

        SUM(
          CASE WHEN finish_position <= 3
          THEN 1 ELSE 0 END
        ) top3

      FROM category_picks

      GROUP BY
        source_key,
        category
    `)
      .all<CategoryRow>();

  const all =
    rows.results ?? [];

  const categoryTotals =
    new Map<
      string,
      {
        samples: number;
        wins: number;
        top3: number;
      }
    >();

  for (const row of all) {
    const current =
      categoryTotals.get(
        row.category
      ) ?? {
        samples: 0,
        wins: 0,
        top3: 0
      };

    current.samples +=
      Number(row.sample_size);

    current.wins +=
      Number(row.wins);

    current.top3 +=
      Number(row.top3);

    categoryTotals.set(
      row.category,
      current
    );
  }

  await env.DB.prepare(`
    DELETE FROM expert_category_priors
  `).run();

  const now =
    new Date().toISOString();

  for (const row of all) {
    const samples =
      Number(row.sample_size);

    const wins =
      Number(row.wins);

    const top3 =
      Number(row.top3);

    const winRate =
      samples > 0
        ? wins / samples
        : 0;

    const top3Rate =
      samples > 0
        ? top3 / samples
        : 0;

    const total =
      categoryTotals.get(
        row.category
      );

    const baselineWin =
      total && total.samples > 0
        ? total.wins /
          total.samples
        : winRate;

    const baselineTop3 =
      total && total.samples > 0
        ? total.top3 /
          total.samples
        : top3Rate;

    const minSamples =
      MIN_SAMPLES[
        row.category
      ] ?? 30;

    let multiplier = 1;

    if (
      samples >= minSamples
    ) {
      const winRatio =
        baselineWin > 0
          ? winRate /
            baselineWin
          : 1;

      const top3Ratio =
        baselineTop3 > 0
          ? top3Rate /
            baselineTop3
          : 1;

      const quality =
        0.65 * winRatio +
        0.35 * top3Ratio;

      const reliability =
        clamp(
          (
            samples -
            minSamples +
            1
          ) / 100,
          0,
          1
        );

      multiplier =
        round(
          1 +
          clamp(
            (
              quality -
              1
            ) *
            0.12 *
            reliability,
            -0.12,
            0.12
          ),
          4
        );
    }

    await env.DB.prepare(`
      INSERT INTO expert_category_priors(
        source_key,
        category,
        sample_size,
        winner_hit_rate,
        top3_hit_rate,
        multiplier,
        updated_at
      )
      VALUES(?,?,?,?,?,?,?)
    `)
      .bind(
        row.source_key,
        row.category,
        samples,
        winRate,
        top3Rate,
        multiplier,
        now
      )
      .run();
  }
}


export function expertCategory(
  prediction: any
): string | null {
  if (prediction.is_banko)
    return "banko";

  if (prediction.is_favorite)
    return "favorite";

  if (prediction.is_strong)
    return "strong";

  if (prediction.is_star)
    return "star";

  if (prediction.is_rival)
    return "rival";

  if (prediction.is_surprise)
    return "surprise";

  return null;
}
