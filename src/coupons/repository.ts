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

  /*
   * Reconcile this meeting's live six-fold windows.
   *
   * Example:
   * Yesterday/previous parse had windows 1 and 2,
   * but the authoritative current card exposes only 1.
   * The obsolete #2 row must not survive.
   *
   * Historical coupon snapshots are intentionally
   * NOT touched here.
   */
  const activeNumbers =
    [...new Set(
      input.windows
        .map(
          window =>
            Number(
              window.sixfold
            )
        )
        .filter(
          value =>
            value === 1 ||
            value === 2
        )
    )];

  if (
    activeNumbers.length
  ) {
    const placeholders =
      activeNumbers
        .map(() => "?")
        .join(",");

    await env.DB.prepare(`
      DELETE FROM sixfold_windows
      WHERE race_date = ?
        AND city = ?
        AND sixfold_number
          NOT IN (${placeholders})
    `)
      .bind(
        input.raceDate,
        input.city,
        ...activeNumbers
      )
      .run();
  } else {
    await env.DB.prepare(`
      DELETE FROM sixfold_windows
      WHERE race_date = ?
        AND city = ?
    `)
      .bind(
        input.raceDate,
        input.city
      )
      .run();
  }

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
        window.source,
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

    const selectionsJson =
      JSON.stringify(
        selections
      );

    /*
     * Deterministic snapshot identity.
     *
     * Same card + profile + budget + exact selections
     * must not create another row merely because the
     * API was requested again.
     *
     * If model inputs move and the selected horses or
     * cost changes, identity changes and a new genuine
     * pre-race snapshot is retained.
     */
    const snapshotKey =
      [
        input.raceDate,
        input.city,
        input.sixfold,
        coupon.profile,
        coupon.budgetTl,
        coupon.totalTl,
        coupon.combinations,
        coupon.unitPriceTl,
        coupon.multiplier,
        selectionsJson
      ].join("|");

    await env.DB.prepare(`
      INSERT OR IGNORE INTO sixfold_coupon_snapshots(
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

        generated_at,
        snapshot_key
      )

      SELECT
        ?,?,?,?,
        ?,?,
        ?,?,?,?,?,
        ?,
        ?,
        ?,?

      WHERE NOT EXISTS (
        SELECT 1
        FROM sixfold_coupon_snapshots existing
        WHERE
          existing.race_date = ?
          AND existing.city = ?
          AND existing.sixfold_number = ?
          AND existing.profile = ?
          AND existing.budget_tl = ?
          AND existing.total_tl = ?
          AND existing.combinations = ?
          AND existing.unit_price_tl = ?
          AND existing.multiplier = ?
          AND existing.selections_json = ?
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

        selectionsJson,

        coupon
          .estimatedSurvivalProbability,

        generatedAt,
        snapshotKey,

        input.raceDate,
        input.city,
        input.sixfold,
        coupon.profile,
        coupon.budgetTl,
        coupon.totalTl,
        coupon.combinations,
        coupon.unitPriceTl,
        coupon.multiplier,
        selectionsJson
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


/*
 * Evaluation depends entirely on learning_races/learning_runner_
 * features carrying a labelled winner for every leg's race. That
 * pipeline only runs for meetings that made it into learning_races
 * in the first place -- a meeting whose ingestion never started (or
 * whose learning row was purged before labelling) will never gain a
 * winner no matter how many times this runs, so a snapshot can sit
 * at evaluated_at IS NULL forever with no visible distinction from
 * one that is genuinely still waiting on today's results. Giving it
 * several days of slack before calling that "unresolved" keeps
 * normal result-ingestion delays (and retries) from being flagged
 * prematurely.
 */
export const SIXFOLD_STALE_AFTER_DAYS =
  5;

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

        AND unresolved_reason
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
      /*
       * Only the age of the snapshot decides this -- never repeated
       * failed attempts -- so a meeting that ingests results slowly
       * is never punished for it, only one that is old enough that
       * waiting further is no longer a reasonable explanation.
       */
      await env.DB.prepare(`
        UPDATE sixfold_coupon_snapshots
        SET unresolved_reason = 'RESULTS_UNAVAILABLE'
        WHERE id = ?
          AND race_date <
            date(
              'now',
              ?
            )
      `)
        .bind(
          row.id,
          `-${SIXFOLD_STALE_AFTER_DAYS} days`
        )
        .run();

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
