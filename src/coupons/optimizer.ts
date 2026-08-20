import {
  calculateCouponCost
} from "./types";


export type CouponProfile =
  | "cautious"
  | "balanced"
  | "maximum-coverage";


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
  profile:
    CouponProfile;

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


const PROFILE_FRACTIONS:
Record<
  CouponProfile,
  number
> = {
  cautious: 0.45,
  balanced: 0.80,
  "maximum-coverage": 1
};


/*
 * Convert relative model scores into a probability
 * distribution inside each race.
 *
 * Temperature deliberately prevents one large raw
 * score difference from becoming near-certain.
 */
function runnerProbabilities(
  runners:
    CouponRunner[]
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

  const temperature = 14;

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
    CouponLegInput
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
        leg.runners
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


function optimizeProfile(
  legs:
    PreparedLeg[],
  profile:
    CouponProfile,
  budgetTl:
    number,
  unitPriceTl:
    number,
  multiplier:
    number
): OptimizedSixFoldCoupon {
  const fraction =
    PROFILE_FRACTIONS[
      profile
    ];

  const targetBudgetTl =
    Math.max(
      unitPriceTl *
        multiplier,
      budgetTl *
        fraction
    );

  const effectiveBudget =
    Math.min(
      budgetTl,
      targetBudgetTl
    );

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
    profile,

    targetBudgetTl:
      Number(
        effectiveBudget
          .toFixed(2)
      ),

    budgetTl:
      Number(
        budgetTl.toFixed(2)
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
          budgetTl -
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
  }
): OptimizedSixFoldCoupon[] {
  if (
    input.legs.length !== 6
  ) {
    throw new Error(
      "SIX_FOLD_REQUIRES_6_LEGS"
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

  const prepared =
    input.legs.map(
      prepareLeg
    );

  return (
    [
      "cautious",
      "balanced",
      "maximum-coverage"
    ] as CouponProfile[]
  ).map(
    profile =>
      optimizeProfile(
        prepared,
        profile,
        input.budgetTl,
        input.unitPriceTl,
        multiplier
      )
  );
}
