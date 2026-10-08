import {
  optimizeSixFoldCoupons,
  type CouponLegInput
} from "../coupons/optimizer";

import {
  sixFoldUnitPrice
} from "../coupons/types";

import {
  displayScore
} from "../scoring/learned-score";


/*
 * Our own altılı for a foreign card, built from the calibrated AGF win
 * probabilities (./calibration.ts) through the same optimiser the
 * domestic coupons use. Nothing here comes from a third party.
 *
 * Budget is fixed rather than user-chosen: the foreign screen shows the
 * card inline, not behind a budget picker, so one coupon per altılı
 * window is all there is room for. 500 TL is the optimiser's own entry
 * tier, and a foreign combination costs 1 TL, so this is 500
 * combinations at most.
 */
export const FOREIGN_MODEL_COUPON_CONFIG = {
  budgetTl: 500,
  legCount: 6
} as const;


export interface CouponRunnerInput {
  number: number;
  name: string;
  winProb?: number | null;
}

export interface CouponRaceInput {
  raceNumber: number;
  time?: string | null;
  sixfoldStartNumbers?: number[];
  runners: CouponRunnerInput[];
}

export interface ForeignModelCoupon {
  /* Which altılı window of the meeting: 1 or 2, as TJK labels them. */
  altili: number;
  startTime: string | null;
  legs: Array<{
    raceNumber: number;
    selection: number[];
    coverageProbability: number;
  }>;
  combinations: number;
  amountTl: number;
  estimatedSurvivalProbability: number;
}


/*
 * TJK marks the first race of each altılı window on the meeting page
 * ("1. 6'LI GANYAN bu koşudan başlar"), so the legs are that race and
 * the five after it. Matched by race number, never by position: races
 * with no runners are dropped before this point and would shift a
 * positional window onto the wrong races.
 */
export function foreignCouponWindows(
  races: CouponRaceInput[]
): Map<number, number> {
  const windows = new Map<number, number>();

  for (const race of races) {
    for (const window of race.sixfoldStartNumbers ?? []) {
      if (!windows.has(window)) {
        windows.set(window, race.raceNumber);
      }
    }
  }

  return windows;
}


function legRaces(
  races: CouponRaceInput[],
  startRaceNumber: number
): CouponRaceInput[] {
  const found: CouponRaceInput[] = [];

  for (let i = 0; i < FOREIGN_MODEL_COUPON_CONFIG.legCount; i += 1) {
    const race =
      races.find(item => item.raceNumber === startRaceNumber + i);

    if (!race) return [];
    found.push(race);
  }

  return found;
}


/*
 * Runners TJK publishes no AGF for get no calibrated probability (see
 * ./calibration.ts), so they cannot be priced and are left out of the
 * leg. A race where that leaves nobody kills the whole window rather
 * than producing a coupon with a guessed leg.
 */
export function foreignCouponLegs(
  races: CouponRaceInput[],
  startRaceNumber: number
): { legs: CouponLegInput[]; races: CouponRaceInput[] } | null {
  const found = legRaces(races, startRaceNumber);

  if (!found.length) return null;

  const legs = found.map(legInput);

  if (legs.some(leg => leg === null)) return null;

  return { legs: legs as CouponLegInput[], races: found };
}


function legInput(
  race: CouponRaceInput
): CouponLegInput | null {
  const runners =
    race.runners.filter(
      runner =>
        typeof runner.winProb === "number" &&
        Number.isFinite(runner.winProb) &&
        (runner.winProb as number) > 0
    );

  if (!runners.length) return null;

  const fieldSize = runners.length;

  return {
    raceNumber: race.raceNumber,

    /*
     * Carried for completeness; the optimiser allocates on the
     * probabilities alone and does not read this today.
     */
    uncertainty: 0.5,

    runners: runners.map(runner => ({
      horseNumber: runner.number,
      horseName: runner.name,
      score: displayScore(runner.winProb as number, fieldSize),
      confidence: 1,
      winProbability: runner.winProb as number
    }))
  };
}


export function buildForeignModelCoupons(
  races: CouponRaceInput[]
): ForeignModelCoupon[] {
  const windows = foreignCouponWindows(races);

  const output: ForeignModelCoupon[] = [];

  for (const altili of [...windows.keys()].sort((a, b) => a - b)) {
    const prepared =
      foreignCouponLegs(races, windows.get(altili) as number);

    if (!prepared) continue;

    let optimized;

    try {
      optimized =
        optimizeSixFoldCoupons({
          legs: prepared.legs,
          budgetTl: FOREIGN_MODEL_COUPON_CONFIG.budgetTl,
          unitPriceTl: sixFoldUnitPrice({ isForeign: true })
        })[0];
    } catch {
      continue;
    }

    if (!optimized) continue;

    output.push({
      altili,
      startTime: prepared.races[0].time ?? null,
      legs: optimized.legs.map(leg => ({
        raceNumber: leg.raceNumber,
        selection: leg.horses.map(horse => horse.horseNumber).sort((a, b) => a - b),
        coverageProbability: leg.coverageProbability
      })),
      combinations: optimized.combinations,
      amountTl: optimized.totalTl,
      estimatedSurvivalProbability: optimized.estimatedSurvivalProbability
    });
  }

  return output;
}
