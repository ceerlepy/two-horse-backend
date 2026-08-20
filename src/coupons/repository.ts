import type {
  Env
} from "../env";

import type {
  OptimizedSixFoldCoupon
} from "./optimizer";

import type {
  SixFoldWindow
} from "./windows";


export async function upsertSixFoldWindows(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    windows:
      SixFoldWindow[];
  }
): Promise<void> {
  const now =
    new Date()
      .toISOString();

  for (
    const window of
    input.windows
  ) {
    await env.DB.prepare(`
      INSERT INTO sixfold_windows(
        race_date,
        city,
        sixfold_number,
        start_race,
        end_race,
        source,
        updated_at
      )
      VALUES(
        ?,?,?,?,?,?,?
      )
      ON CONFLICT(
        race_date,
        city,
        sixfold_number
      )
      DO UPDATE SET
        start_race =
          excluded.start_race,
        end_race =
          excluded.end_race,
        source =
          excluded.source,
        updated_at =
          excluded.updated_at
    `)
      .bind(
        input.raceDate,
        input.city,
        window.sixfold,
        window.startRace,
        window.endRace,
        "canonical-program",
        now
      )
      .run();
  }
}


export async function persistSixFoldCoupons(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    sixfold: number;
    startRace: number;
    endRace: number;
    coupons:
      OptimizedSixFoldCoupon[];
  }
): Promise<void> {
  const generatedAt =
    new Date()
      .toISOString();

  for (
    const coupon of
    input.coupons
  ) {
    const selections =
      coupon.legs.map(
        leg => ({
          raceNumber:
            leg.raceNumber,

          horseNumbers:
            leg.horses.map(
              horse =>
                horse.horseNumber
            )
        })
      );

    await env.DB.prepare(`
      INSERT INTO sixfold_coupon_snapshots(
        race_date,
        city,
        sixfold_number,
        profile,

        start_race,
        end_race,

        budget_tl,
        total_tl,
        combinations,
        unit_price_tl,
        multiplier,

        selections_json,

        estimated_survival_probability,

        generated_at
      )
      VALUES(
        ?,?,?,?,
        ?,?,
        ?,?,?,?,?,
        ?,
        ?,
        ?
      )
    `)
      .bind(
        input.raceDate,
        input.city,
        input.sixfold,
        coupon.profile,

        input.startRace,
        input.endRace,

        coupon.budgetTl,
        coupon.totalTl,
        coupon.combinations,
        coupon.unitPriceTl,
        coupon.multiplier,

        JSON.stringify(
          selections
        ),

        coupon
          .estimatedSurvivalProbability,

        generatedAt
      )
      .run();
  }
}


interface PendingCoupon {
  id: number;
  race_date: string;
  city: string;
  selections_json: string;
}


export async function evaluatePendingSixFoldCoupons(
  env: Env
): Promise<{
  evaluated: number;
}> {
  const rows =
    await env.DB.prepare(`
      SELECT
        id,
        race_date,
        city,
        selections_json

      FROM sixfold_coupon_snapshots

      WHERE evaluated_at
        IS NULL
    `)
      .all<PendingCoupon>();

  let evaluated = 0;

  for (
    const row of
    rows.results ?? []
  ) {
    let selections:
      Array<{
        raceNumber: number;
        horseNumbers: number[];
      }>;

    try {
      selections =
        JSON.parse(
          row.selections_json
        );
    } catch {
      continue;
    }

    if (
      !Array.isArray(
        selections
      ) ||
      selections.length !== 6
    ) {
      continue;
    }

    const winners =
      await env.DB.prepare(`
        SELECT
          lr.race_number,
          lrf.horse_number

        FROM learning_races lr

        JOIN learning_runner_features lrf
          ON lrf.race_date =
               lr.race_date
         AND lrf.city =
               lr.city
         AND lrf.race_number =
               lr.race_number

        WHERE
          lr.race_date = ?
          AND lr.city = ?
          AND lrf.finish_position = 1
      `)
        .bind(
          row.race_date,
          row.city
        )
        .all<any>();

    const winnerMap =
      new Map<
        number,
        number
      >();

    for (
      const winner of
      winners.results ?? []
    ) {
      winnerMap.set(
        Number(
          winner.race_number
        ),
        Number(
          winner.horse_number
        )
      );
    }

    const allResolved =
      selections.every(
        leg =>
          winnerMap.has(
            Number(
              leg.raceNumber
            )
          )
      );

    if (!allResolved) {
      continue;
    }

    let hitLegs = 0;

    for (
      const leg of
      selections
    ) {
      const winner =
        winnerMap.get(
          Number(
            leg.raceNumber
          )
        );

      if (
        winner != null &&
        leg.horseNumbers
          .map(Number)
          .includes(
            winner
          )
      ) {
        hitLegs += 1;
      }
    }

    await env.DB.prepare(`
      UPDATE sixfold_coupon_snapshots

      SET
        evaluated_at = ?,
        hit_legs = ?,
        six_of_six = ?,
        five_of_six = ?

      WHERE id = ?
    `)
      .bind(
        new Date()
          .toISOString(),

        hitLegs,

        hitLegs === 6
          ? 1
          : 0,

        hitLegs === 5
          ? 1
          : 0,

        row.id
      )
      .run();

    evaluated += 1;
  }

  return {
    evaluated
  };
}
