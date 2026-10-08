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
  type CouponRaceInput
} from "./model-coupon";

import type {
  ForeignRace
} from "./service";


export interface ForeignCouponResult {
  date: string;
  city: string;
  country: string | null;
  sixfold: number;
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
 * The user's own altılı for a foreign meeting, at the budget they
 * picked. Same window and pricing rules as the card's fixed-budget
 * coupon (./model-coupon.ts) and the same optimiser as the domestic
 * coupons, so a foreign coupon reads exactly like a domestic one.
 *
 * Nothing is persisted: the sixfold snapshot and evaluation tables are
 * keyed on domestic meetings, and a foreign card has no results feed
 * here to evaluate against.
 */
export async function generateForeignSixFoldCoupons(
  env: Env,
  input: {
    city: string;
    budgetTl: number;
    sixfold: number;
    multiplier?: number;
    raceDate?: string;
  }
): Promise<ForeignCouponResult> {
  const raceDate = input.raceDate ?? turkeyDate();

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
    foreignCouponWindows(priced).get(input.sixfold);

  if (startRaceNumber === undefined) {
    throw new Error("SIX_FOLD_WINDOW_NOT_AVAILABLE");
  }

  const prepared = foreignCouponLegs(priced, startRaceNumber);

  if (!prepared) {
    throw new Error("SIX_FOLD_WINDOW_NOT_AVAILABLE");
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
    sixfold: input.sixfold,
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
