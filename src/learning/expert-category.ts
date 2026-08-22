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


interface RawExpertPickRow {
  source_key: string;
  finish_position: number;

  is_banko: number;
  is_favorite: number;
  is_strong: number;
  is_star: number;
  is_rival: number;
  is_surprise: number;
}


function categoriesForPick(
  row: RawExpertPickRow
): string[] {
  const categories:
    string[] = [];

  if (row.is_banko === 1) {
    categories.push(
      "banko"
    );
  }

  if (row.is_favorite === 1) {
    categories.push(
      "favorite"
    );
  }

  if (row.is_strong === 1) {
    categories.push(
      "strong"
    );
  }

  if (row.is_star === 1) {
    categories.push(
      "star"
    );
  }

  if (row.is_rival === 1) {
    categories.push(
      "rival"
    );
  }

  if (row.is_surprise === 1) {
    categories.push(
      "surprise"
    );
  }

  return categories;
}


export async function rebuildExpertCategoryPriors(
  env: Env
): Promise<void> {
  /*
   * Read learning_expert_picks exactly once.
   *
   * Category expansion is performed in TypeScript
   * instead of using a compound SQL query.
   */
  const raw =
    await env.DB.prepare(`
      SELECT
        source_key,
        finish_position,

        is_banko,
        is_favorite,
        is_strong,
        is_star,
        is_rival,
        is_surprise

      FROM learning_expert_picks

      WHERE finish_position > 0
    `)
      .all<RawExpertPickRow>();

  const grouped =
    new Map<
      string,
      CategoryRow
    >();

  for (
    const pick of
    raw.results ?? []
  ) {
    const categories =
      categoriesForPick(
        pick
      );

    for (
      const category of
      categories
    ) {
      const key =
        [
          pick.source_key,
          category
        ].join("\u001f");

      const current =
        grouped.get(key) ?? {
          source_key:
            pick.source_key,

          category,

          sample_size: 0,
          wins: 0,
          top3: 0
        };

      current.sample_size += 1;

      const finishPosition =
        Number(
          pick.finish_position
        );

      if (
        finishPosition === 1
      ) {
        current.wins += 1;
      }

      if (
        finishPosition <= 3
      ) {
        current.top3 += 1;
      }

      grouped.set(
        key,
        current
      );
    }
  }

  const all =
    Array.from(
      grouped.values()
    );

  const categoryTotals =
    new Map<
      string,
      {
        samples: number;
        wins: number;
        top3: number;
      }
    >();

  for (
    const row of
    all
  ) {
    const current =
      categoryTotals.get(
        row.category
      ) ?? {
        samples: 0,
        wins: 0,
        top3: 0
      };

    current.samples +=
      Number(
        row.sample_size
      );

    current.wins +=
      Number(
        row.wins
      );

    current.top3 +=
      Number(
        row.top3
      );

    categoryTotals.set(
      row.category,
      current
    );
  }

  const now =
    new Date()
      .toISOString();

  /*
   * Calculation is complete before persistence.
   * Replacement can now happen deterministically.
   */
  await env.DB.prepare(`
    DELETE FROM expert_category_priors
  `)
    .run();

  for (
    const row of
    all
  ) {
    const samples =
      Number(
        row.sample_size
      );

    const wins =
      Number(
        row.wins
      );

    const top3 =
      Number(
        row.top3
      );

    const winRate =
      samples > 0
        ? wins /
          samples
        : 0;

    const top3Rate =
      samples > 0
        ? top3 /
          samples
        : 0;

    const total =
      categoryTotals.get(
        row.category
      );

    const baselineWin =
      total &&
      total.samples > 0
        ? total.wins /
          total.samples
        : winRate;

    const baselineTop3 =
      total &&
      total.samples > 0
        ? total.top3 /
          total.samples
        : top3Rate;

    const minSamples =
      MIN_SAMPLES[
        row.category
      ] ?? 30;

    let multiplier = 1;

    if (
      samples >=
      minSamples
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
        0.65 *
        winRatio +
        0.35 *
        top3Ratio;

      const reliability =
        clamp(
          (
            samples -
            minSamples +
            1
          ) /
          100,
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
      VALUES(
        ?,?,?,?,?,?,?
      )

      ON CONFLICT(
        source_key,
        category
      )
      DO UPDATE SET
        sample_size =
          excluded.sample_size,

        winner_hit_rate =
          excluded.winner_hit_rate,

        top3_hit_rate =
          excluded.top3_hit_rate,

        multiplier =
          excluded.multiplier,

        updated_at =
          excluded.updated_at
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
