import {
  calculateCouponCost
} from "./types";


export interface CouponRunner {
  horseNumber: number;
  horseName?: string | null;

  score: number;
  confidence: number;
}


export interface CouponLegInput {
  raceNumber: number;

  uncertainty: number;

  runners:
    CouponRunner[];
}


export interface CouponLegSelection {
  raceNumber: number;

  horses: Array<{
    horseNumber: number;
    horseName: string | null;
    score: number;
    probability: number;
  }>;

  coverageProbability: number;
}


export interface OptimizedSixFoldCoupon {
  /*
   * A label for this coupon's budget tier -- see
   * COUPON_BUDGET_LADDER_CONFIG below. Historically this held a
   * spend-strategy name ("cautious"/"balanced"/"maximum-coverage");
   * it is kept as a string field (DB column name unchanged) but now
   * holds the tier's budget amount as text, e.g. "500", "1300".
   */
  profile:
    string;

  targetBudgetTl:
    number;

  budgetTl:
    number;

  combinations:
    number;

  unitPriceTl:
    number;

  multiplier:
    number;

  totalTl:
    number;

  unusedBudgetTl:
    number;

  estimatedSurvivalProbability:
    number;

  legs:
    CouponLegSelection[];
}


interface PreparedRunner
  extends CouponRunner {
  probability: number;
}


interface PreparedLeg {
  raceNumber: number;

  uncertainty: number;

  runners:
    PreparedRunner[];
}


/*
 * A user's budget field is the CEILING they're willing to spend, not
 * a single amount to spend in full -- this ladder turns that ceiling
 * into several concrete coupons at increasing budgets, so someone
 * can see what a small, cautious stake buys next to what their full
 * budget buys, instead of only ever seeing one number.
 *
 * fixedTiersTl: always offered first, identical for every user
 * regardless of their max budget (as long as they can afford them) --
 * a stable "entry point" coupon size people can compare day to day.
 *
 * variableTierCount: how many more coupons fill the gap from the
 * highest affordable fixed tier up to the user's own max budget,
 * evenly spaced so the steps between them feel proportional rather
 * than arbitrary. The last of these is always exactly the user's max
 * budget (never overshoots it, never leaves it unused).
 *
 * roundToNearestTl: the 3 tiers strictly between the highest fixed
 * tier and the max budget are rounded to a clean number; only the
 * final (max-budget) tier is left exact.
 */
export const COUPON_BUDGET_LADDER_CONFIG = {
  fixedTiersTl: [500, 750],
  variableTierCount: 4,
  roundToNearestTl: 50
} as const;

export function buildCouponBudgetLadder(
  maxBudgetTl: number
): number[] {
  const fixedTiers =
    COUPON_BUDGET_LADDER_CONFIG.fixedTiersTl.filter(
      tier => tier <= maxBudgetTl
    );

  const baseTl =
    fixedTiers.length
      ? fixedTiers[fixedTiers.length - 1]
      : 0;

  const tiers: number[] = [...fixedTiers];

  /*
   * Tracked separately from tiers[tiers.length - 1]: when there are
   * no fixed tiers yet (tiers is still empty), comparing a candidate
   * against an empty array's last element (undefined) would make
   * every "> " comparison false and silently drop every tier.
   */
  let lastValue = baseTl;

  if (maxBudgetTl > baseTl) {
    const count =
      COUPON_BUDGET_LADDER_CONFIG.variableTierCount;

    const step =
      (maxBudgetTl - baseTl) / count;

    for (let i = 1; i <= count; i += 1) {
      const isLast = i === count;

      const raw =
        baseTl + step * i;

      const value =
        isLast
          ? maxBudgetTl
          : Math.round(
              raw /
              COUPON_BUDGET_LADDER_CONFIG.roundToNearestTl
            ) *
            COUPON_BUDGET_LADDER_CONFIG.roundToNearestTl;

      if (value > lastValue) {
        tiers.push(value);
        lastValue = value;
      }
    }
  }

  return tiers.length
    ? tiers
    : [maxBudgetTl];
}


/*
 * Convert relative model scores into a probability
 * distribution inside each race.
 *
 * Temperature deliberately prevents one large raw
 * score difference from becoming near-certain. It is
 * a parameter, not a constant, so real evaluated-coupon
 * outcomes can calibrate it over time -- see
 * ./calibration.ts.
 */
export const DEFAULT_COUPON_TEMPERATURE = 14;

function runnerProbabilities(
  runners:
    CouponRunner[],
  temperature:
    number =
      DEFAULT_COUPON_TEMPERATURE
): PreparedRunner[] {
  if (!runners.length) {
    return [];
  }

  const ordered =
    [...runners]
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  const best =
    ordered[0].score;

  const weights =
    ordered.map(
      runner => {
        const confidence =
          Math.max(
            0.20,
            Math.min(
              1,
              runner.confidence
            )
          );

        const relative =
          Math.exp(
            (
              runner.score -
              best
            ) /
            temperature
          );

        /*
         * Low-confidence scores are shrunk toward
         * a flatter distribution.
         */
        return (
          relative *
          (
            0.60 +
            0.40 *
            confidence
          )
        );
      }
    );

  const total =
    weights.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  return ordered.map(
    (runner, index) => ({
      ...runner,

      probability:
        total > 0
          ? weights[index] /
            total
          : 1 /
            ordered.length
    })
  );
}


function prepareLeg(
  leg:
    CouponLegInput,
  temperature:
    number
): PreparedLeg {
  return {
    raceNumber:
      leg.raceNumber,

    uncertainty:
      Math.max(
        0,
        Math.min(
          1,
          leg.uncertainty
        )
      ),

    runners:
      runnerProbabilities(
        leg.runners,
        temperature
      )
  };
}


function selectedCoverage(
  leg:
    PreparedLeg,
  count:
    number
): number {
  return leg.runners
    .slice(0, count)
    .reduce(
      (sum, runner) =>
        sum +
        runner.probability,
      0
    );
}


function survivalProbability(
  legs:
    PreparedLeg[],
  counts:
    number[]
): number {
  return legs.reduce(
    (product, leg, index) =>
      product *
      selectedCoverage(
        leg,
        counts[index]
      ),
    1
  );
}


function ticketCost(
  counts:
    number[],
  unitPriceTl:
    number,
  multiplier:
    number
) {
  return calculateCouponCost({
    selectionsPerLeg:
      counts,

    unitPriceTl,

    multiplier
  });
}


interface HalfCandidate {
  counts: number[];
  combinations: number;
  survival: number;
}

function enumerateHalf(
  legs: PreparedLeg[]
): HalfCandidate[] {
  const output: HalfCandidate[] = [];

  function visit(
    index: number,
    counts: number[],
    combinations: number,
    survival: number
  ): void {
    if (index === legs.length) {
      output.push({
        counts:[...counts],
        combinations,
        survival
      });
      return;
    }

    const leg = legs[index];

    for (
      let count = 1;
      count <= leg.runners.length;
      count += 1
    ) {
      counts.push(count);

      visit(
        index + 1,
        counts,
        combinations * count,
        survival *
          selectedCoverage(
            leg,
            count
          )
      );

      counts.pop();
    }
  }

  visit(0, [], 1, 1);
  return output;
}

function globallyOptimalCounts(
  legs: PreparedLeg[],
  unitPriceTl: number,
  multiplier: number,
  budgetTl: number
): number[] {
  const combinationPrice =
    unitPriceTl * multiplier;

  const maxCombinations =
    Math.floor(
      (budgetTl + 1e-9) /
      combinationPrice
    );

  if (maxCombinations < 1) {
    throw new Error(
      `BUDGET_BELOW_MINIMUM:${combinationPrice}`
    );
  }

  const split =
    Math.floor(
      legs.length / 2
    );

  const left =
    enumerateHalf(
      legs.slice(0, split)
    );

  const right =
    enumerateHalf(
      legs.slice(split)
    )
      .filter(
        item =>
          item.combinations <=
          maxCombinations
      )
      .sort(
        (a,b) =>
          a.combinations -
          b.combinations
      );

  if (!right.length) {
    throw new Error(
      "NO_AFFORDABLE_COUPON"
    );
  }

  const prefixBest:
    HalfCandidate[] = [];

  let best:
    HalfCandidate | null =
    null;

  for (const item of right) {
    if (
      best == null ||
      item.survival >
        best.survival + 1e-15 ||
      (
        Math.abs(
          item.survival -
          best.survival
        ) <= 1e-15 &&
        item.combinations >
          best.combinations
      )
    ) {
      best = item;
    }

    prefixBest.push(best);
  }

  function lastAffordable(
    value: number
  ): number {
    let lo = 0;
    let hi = right.length;

    while (lo < hi) {
      const mid =
        Math.floor(
          (lo + hi) / 2
        );

      if (
        right[mid].combinations <=
        value
      ) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    return lo - 1;
  }

  let winner:
    {
      counts: number[];
      survival: number;
      combinations: number;
    } | null =
    null;

  for (const lhs of left) {
    if (
      lhs.combinations >
      maxCombinations
    ) {
      continue;
    }

    const limit =
      Math.floor(
        maxCombinations /
        lhs.combinations
      );

    const index =
      lastAffordable(limit);

    if (index < 0) {
      continue;
    }

    const rhs =
      prefixBest[index];

    const survival =
      lhs.survival *
      rhs.survival;

    const combinations =
      lhs.combinations *
      rhs.combinations;

    if (
      winner == null ||
      survival >
        winner.survival + 1e-15 ||
      (
        Math.abs(
          survival -
          winner.survival
        ) <= 1e-15 &&
        combinations >
          winner.combinations
      )
    ) {
      winner = {
        counts:[
          ...lhs.counts,
          ...rhs.counts
        ],
        survival,
        combinations
      };
    }
  }

  if (!winner) {
    throw new Error(
      "NO_AFFORDABLE_COUPON"
    );
  }

  return winner.counts;
}


function optimizeForBudgetTier(
  legs:
    PreparedLeg[],
  tierBudgetTl:
    number,
  unitPriceTl:
    number,
  multiplier:
    number
): OptimizedSixFoldCoupon {
  /*
   * Every tier spends up to its own full budget for the best
   * achievable survival probability -- the ladder itself (which
   * tier this is) is what expresses "cautious" vs "aggressive" now,
   * not a fraction held back within a single budget. If this tier's
   * budget can't afford even one combination, globallyOptimalCounts
   * below throws BUDGET_BELOW_MINIMUM for it -- no artificial floor
   * is applied here that would silently overspend the tier.
   */
  const effectiveBudget =
    tierBudgetTl;

  const counts =
    globallyOptimalCounts(
      legs,
      unitPriceTl,
      multiplier,
      effectiveBudget
    );

  const cost =
    ticketCost(
      counts,
      unitPriceTl,
      multiplier
    );

  const survival =
    survivalProbability(
      legs,
      counts
    );

  const selections =
    legs.map(
      (leg, index) => {
        const horses =
          leg.runners
            .slice(
              0,
              counts[index]
            );

        return {
          raceNumber:
            leg.raceNumber,

          horses:
            horses.map(
              runner => ({
                horseNumber:
                  runner.horseNumber,

                horseName:
                  runner.horseName ??
                  null,

                score:
                  runner.score,

                probability:
                  Number(
                    runner
                      .probability
                      .toFixed(6)
                  )
              })
            ),

          coverageProbability:
            Number(
              selectedCoverage(
                leg,
                counts[index]
              ).toFixed(6)
            )
        };
      }
    );

  return {
    profile:
      String(tierBudgetTl),

    targetBudgetTl:
      Number(
        effectiveBudget
          .toFixed(2)
      ),

    budgetTl:
      Number(
        tierBudgetTl.toFixed(2)
      ),

    combinations:
      cost.combinations,

    unitPriceTl:
      cost.unitPriceTl,

    multiplier:
      cost.multiplier,

    totalTl:
      cost.totalTl,

    unusedBudgetTl:
      Number(
        (
          tierBudgetTl -
          cost.totalTl
        ).toFixed(2)
      ),

    estimatedSurvivalProbability:
      Number(
        survival
          .toFixed(6)
      ),

    legs:
      selections
  };
}


export function optimizeSixFoldCoupons(
  input: {
    legs:
      CouponLegInput[];

    budgetTl:
      number;

    unitPriceTl:
      number;

    multiplier?:
      number;

    /*
     * Defaults to DEFAULT_COUPON_TEMPERATURE. A caller
     * passes a calibrated value once enough evaluated
     * sixfold legs exist to trust one -- see
     * ./calibration.ts.
     */
    temperature?:
      number;
  }
): OptimizedSixFoldCoupon[] {
  /*
   * input.budgetTl is the user's MAX budget, a ceiling -- not a
   * single amount to spend in full. See buildCouponBudgetLadder
   * above: it is expanded into several coupons at increasing budget
   * tiers (two fixed entry-point tiers, then evenly-spaced tiers up
   * to and including this max), one per tier.
   *
   * Shared by both TJK accumulator pools this system supports:
   * Altılı Ganyan (6 legs) and Beşli Ganyan (5 legs). Nothing below
   * this guard assumes a fixed leg count.
   */
  if (
    input.legs.length !== 5 &&
    input.legs.length !== 6
  ) {
    throw new Error(
      "GANYAN_POOL_REQUIRES_5_OR_6_LEGS"
    );
  }

  if (
    !Number.isFinite(
      input.budgetTl
    ) ||
    input.budgetTl <= 0
  ) {
    throw new Error(
      "INVALID_COUPON_BUDGET"
    );
  }

  if (
    input.legs.some(
      leg =>
        leg.runners.length === 0
    )
  ) {
    throw new Error(
      "EMPTY_COUPON_LEG"
    );
  }

  const multiplier =
    input.multiplier ??
    1;

  if (
    !Number.isInteger(
      multiplier
    ) ||
    multiplier < 1
  ) {
    throw new Error(
      "INVALID_MULTIPLIER"
    );
  }

  const temperature =
    input.temperature ??
    DEFAULT_COUPON_TEMPERATURE;

  const prepared =
    input.legs.map(
      leg =>
        prepareLeg(
          leg,
          temperature
        )
    );

  const tiers =
    buildCouponBudgetLadder(
      input.budgetTl
    );

  return tiers.map(
    tierBudgetTl =>
      optimizeForBudgetTier(
        prepared,
        tierBudgetTl,
        input.unitPriceTl,
        multiplier
      )
  );
}
