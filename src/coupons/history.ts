import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

/*
 * Premium's coupon history: the coupon ladder the cron freezes once per
 * Altılı / Beşli window in the minutes before its first leg (see
 * capture.ts), with how many legs each coupon hit once the results
 * were in. If a window ever holds more than one snapshot per budget
 * profile (an admin POST can add one later), the earliest is shown:
 * it is the honest pre-race one.
 */
export interface CouponHistoryLeg {
  raceNumber: number;
  horseNumbers: number[];
}

export interface CouponHistoryEntry {
  pool: "sixfold" | "fivefold";
  raceDate: string;
  city: string;
  windowNumber: number;
  startRace: number;
  endRace: number;
  profile: string;
  budgetTl: number;
  totalTl: number;
  combinations: number;
  generatedAt: string;
  evaluated: boolean;
  legCount: number;
  hitLegs: number | null;
  allLegsHit: boolean | null;
  legs: CouponHistoryLeg[];
}

const MAX_ROWS = 400;

function parseLegs(
  value: unknown
): CouponHistoryLeg[] {
  try {
    const parsed =
      JSON.parse(String(value ?? "[]"));

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(
      (leg: any) => ({
        raceNumber:
          Number(leg?.raceNumber),
        horseNumbers:
          Array.isArray(leg?.horseNumbers)
            ? leg.horseNumbers.map(Number).filter(Number.isFinite)
            : []
      })
    );
  } catch {
    return [];
  }
}

function addDays(
  date: string,
  days: number
): string {
  const d =
    new Date(`${date}T00:00:00Z`);

  d.setUTCDate(
    d.getUTCDate() + days
  );

  return d.toISOString().slice(0, 10);
}

export async function getCouponHistory(
  env: Env,
  options: {
    days: number;
    now?: Date;
  }
): Promise<CouponHistoryEntry[]> {
  const fromDate =
    addDays(
      turkeyDate(options.now),
      -(options.days - 1)
    );

  const rows =
    await env.DB.prepare(
      `WITH snaps AS (
         SELECT 'sixfold' AS pool, race_date, city, sixfold_number AS window_number,
                start_race, end_race, profile, budget_tl, total_tl, combinations,
                selections_json, generated_at, evaluated_at, hit_legs,
                six_of_six AS all_hit, 6 AS leg_count
         FROM sixfold_coupon_snapshots WHERE race_date >= ?1
         UNION ALL
         SELECT 'fivefold', race_date, city, fivefold_number,
                start_race, end_race, profile, budget_tl, total_tl, combinations,
                selections_json, generated_at, evaluated_at, hit_legs,
                five_of_five, 5
         FROM fivefold_coupon_snapshots WHERE race_date >= ?1
       ),
       ranked AS (
         SELECT snaps.*,
                ROW_NUMBER() OVER (
                  PARTITION BY pool, race_date, city, window_number, profile
                  ORDER BY generated_at ASC
                ) AS rn
         FROM snaps
       )
       SELECT * FROM ranked
       WHERE rn = 1
       ORDER BY race_date DESC, city, pool, window_number, budget_tl
       LIMIT ?2`
    )
      .bind(
        fromDate,
        MAX_ROWS
      )
      .all<any>();

  return (rows.results ?? []).map(
    row => {
      const evaluated =
        row.evaluated_at != null &&
        row.hit_legs != null;

      return {
        pool: row.pool,
        raceDate: row.race_date,
        city: row.city,
        windowNumber: Number(row.window_number),
        startRace: Number(row.start_race),
        endRace: Number(row.end_race),
        profile: String(row.profile),
        budgetTl: Number(row.budget_tl),
        totalTl: Number(row.total_tl),
        combinations: Number(row.combinations),
        generatedAt: row.generated_at,
        evaluated,
        legCount: Number(row.leg_count),
        hitLegs:
          evaluated ? Number(row.hit_legs) : null,
        allLegsHit:
          evaluated ? Number(row.all_hit) === 1 : null,
        legs:
          parseLegs(row.selections_json)
      };
    }
  );
}
