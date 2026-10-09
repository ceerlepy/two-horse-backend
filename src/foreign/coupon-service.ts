import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  optimizeSixFoldCoupons,
  type OptimizedSixFoldCoupon
} from "../coupons/optimizer";

import {
  sixFoldUnitPrice
} from "../coupons/types";

import {
  foreignCountryGroup,
  withForeignWinProbs
} from "./calibration";

import {
  foreignCouponLegs,
  foreignCouponWindows,
  foreignPoolLegCount,
  type CouponRaceInput,
  type ForeignPool
} from "./model-coupon";

import type {
  ForeignRace
} from "./service";


export interface ForeignCouponResult {
  date: string;
  city: string;
  country: string | null;
  pool: ForeignPool;
  /* Window number, under the key the domestic response uses for the pool. */
  sixfold?: number;
  fivefold?: number;
  startRace: number;
  endRace: number;
  startTime: string | null;
  budgetTl: number;
  unitPriceTl: number;
  multiplier: number;
  generatedAt: string;
  coupons: OptimizedSixFoldCoupon[];
}


/*
 * The user's own altılı (or beşli) for a foreign meeting, at the budget
 * they picked. Same window and pricing rules as the card's fixed-budget
 * coupon (./model-coupon.ts) and the same optimiser as the domestic
 * coupons, so a foreign coupon reads exactly like a domestic one.
 *
 * Nothing is persisted here: the snapshot and evaluation tables are
 * keyed on domestic meetings. A member who saves the coupon to
 * "Kuponlarım" gets it scored from ./results.ts.
 */
export async function generateForeignSixFoldCoupons(
  env: Env,
  input: {
    city: string;
    budgetTl: number;
    sixfold: number;
    pool?: ForeignPool;
    multiplier?: number;
    raceDate?: string;
  }
): Promise<ForeignCouponResult> {
  const raceDate = input.raceDate ?? turkeyDate();
  const pool = input.pool ?? "sixfold";
  const unavailable =
    pool === "fivefold"
      ? "FIVE_FOLD_WINDOW_NOT_AVAILABLE"
      : "SIX_FOLD_WINDOW_NOT_AVAILABLE";

  const row =
    await env.DB.prepare(`
      SELECT city, country, program_json
      FROM foreign_meetings
      WHERE race_date = ? AND city = ?
    `)
      .bind(raceDate, input.city)
      .first<any>();

  if (!row) {
    throw new Error("FOREIGN_MEETING_NOT_FOUND");
  }

  let races: ForeignRace[] = [];

  try {
    races = JSON.parse(row.program_json);
  } catch {
    races = [];
  }

  const group = foreignCountryGroup(row.city, row.country);

  const priced =
    races.map(
      race => withForeignWinProbs(race, group)
    ) as unknown as CouponRaceInput[];

  const startRaceNumber =
    foreignCouponWindows(priced, pool).get(input.sixfold);

  if (startRaceNumber === undefined) {
    throw new Error(unavailable);
  }

  const prepared =
    foreignCouponLegs(priced, startRaceNumber, foreignPoolLegCount(pool));

  if (!prepared) {
    throw new Error(unavailable);
  }

  const unitPriceTl = sixFoldUnitPrice({ isForeign: true });

  const coupons =
    optimizeSixFoldCoupons({
      legs: prepared.legs,
      budgetTl: input.budgetTl,
      unitPriceTl,
      multiplier: input.multiplier ?? 1
    });

  return {
    date: raceDate,
    city: row.city,
    country: row.country ?? null,
    pool,
    ...(pool === "fivefold"
      ? { fivefold: input.sixfold }
      : { sixfold: input.sixfold }),
    startRace: prepared.races[0].raceNumber,
    endRace: prepared.races[prepared.races.length - 1].raceNumber,
    startTime: prepared.races[0].time ?? null,
    budgetTl: input.budgetTl,
    unitPriceTl,
    multiplier: input.multiplier ?? 1,
    generatedAt: new Date().toISOString(),
    coupons
  };
}
