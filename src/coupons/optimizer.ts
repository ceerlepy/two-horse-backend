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


/*
 * Choose which ONE additional horse is most
 * valuable at the current state.
 *
 * Objective:
 *
 * marginal increase in log six-fold survival
 * -------------------------------------------
 * marginal ticket cost
 *
 * Uncertainty slightly rewards expansion in
 * genuinely difficult legs.
 */
function bestExpansion(
  legs:
    PreparedLeg[],
  counts:
    number[],
  unitPriceTl:
    number,
  multiplier:
    number,
  maxBudgetTl:
    number
): {
  legIndex: number;
  utility: number;
} | null {
  const currentCost =
    ticketCost(
      counts,
      unitPriceTl,
      multiplier
    ).totalTl;

  let best:
    {
      legIndex: number;
      utility: number;
    } | null =
    null;

  for (
    let i = 0;
    i < legs.length;
    i += 1
  ) {
    const leg =
      legs[i];

    if (
      counts[i] >=
      leg.runners.length
    ) {
      continue;
    }

    const candidateCounts =
      [...counts];

    candidateCounts[i] += 1;

    const nextCost =
      ticketCost(
        candidateCounts,
        unitPriceTl,
        multiplier
      ).totalTl;

    if (
      nextCost >
      maxBudgetTl +
        1e-9
    ) {
      continue;
    }

    const before =
      Math.max(
        1e-12,
        selectedCoverage(
          leg,
          counts[i]
        )
      );

    const after =
      Math.max(
        before,
        selectedCoverage(
          leg,
          candidateCounts[i]
        )
      );

    const survivalGain =
      Math.log(after) -
      Math.log(before);

    const extraCost =
      Math.max(
        0.01,
        nextCost -
        currentCost
      );

    const uncertaintyBoost =
      1 +
      0.35 *
      leg.uncertainty;

    const utility =
      (
        survivalGain *
        uncertaintyBoost
      ) /
      extraCost;

    if (
      best == null ||
      utility >
        best.utility
    ) {
      best = {
        legIndex: i,
        utility
      };
    }
  }

  return best;
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

  /*
   * Start with one horse in every leg.
   * This is the minimum valid six-fold.
   */
  const counts =
    legs.map(() => 1);

  const minimum =
    ticketCost(
      counts,
      unitPriceTl,
      multiplier
    );

  if (
    minimum.totalTl >
    budgetTl
  ) {
    throw new Error(
      `BUDGET_BELOW_MINIMUM:` +
      `${minimum.totalTl}`
    );
  }

  while (true) {
    const expansion =
      bestExpansion(
        legs,
        counts,
        unitPriceTl,
        multiplier,
        effectiveBudget
      );

    if (
      expansion == null ||
      expansion.utility <= 0
    ) {
      break;
    }

    counts[
      expansion.legIndex
    ] += 1;
  }

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
