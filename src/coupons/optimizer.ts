import {
  calculateCouponCost
} from "./types";


export interface CouponRunner {
  horseNumber: number;
  horseName?: string | null;

  score: number;
  confidence: number;

  /*
   * Win probability from the learned model score. When every runner in
   * the leg has one, it is used directly instead of softmaxing the 0-100
   * scores -- the model already produces a calibrated distribution, so
   * re-deriving one would only blur it.
   */
  winProbability?: number | null;
}


export interface CouponLegInput {
  raceNumber: number;

  uncertainty: number;

  /*
   * "Risk sever" coupons: a horse that must be on the ticket in this
   * leg (the value model's surprise). Every selection size then keeps
   * the best-ranked horse(s) plus this one.
   */
  forcedHorseNumber?: number | null;

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

  /* Lower edge of this coupon's price band; targetBudgetTl is the upper. */
  bandMinTl:
    number;

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

  /* Smallest selection size; 2 when a forced horse is not the top pick. */
  minCount: number;
}


/*
 * A user's budget field is the CEILING they're willing to spend. It is
 * cut into price bands (0-500, 500-750, 750-1000, 1000-1500, ... up to
 * the ceiling) and
 * each band gets one coupon: the cheapest one in the band whose chance
 * is within stopTolerance of the best the band can buy. So a coupon
 * does not stretch to a round number; it stops where more horses stop
 * adding real chance, and its price is whatever that costs.
 *
 * Up to nestedUpToTl (Gold's ceiling) each coupon also contains the
 * previous one, so a cheaper coupon never hits where a dearer one
 * misses: every band is built from the same model chances, only the
 * number of horses differs. Above it every band is built on its own:
 * chaining all bands lost real hits there.
 *
 * Backtest (579 past altılı, AGF probabilities;
 * /mnt/project-files/analysis/kupon-bant-testi-2026-10-11): up to
 * 2000 TL the nested bands hit as often as the old independent tiers
 * for the money (1356 TL 118 vs 1366 TL 117) and never miss where a
 * cheaper one hit; the 4500-5000 band chained to every lower band hit
 * 174 times against 196 built on its own. Nested and independent hit
 * the same up to 2000 TL (423 vs 423), so the owner chose 1500.
 *
 * minTicketTl: TJK's minimum stake per ticket.
 */
/*
 * 500-1000 is split at 750 (owner, 12 Oct): one coupon near 500 and
 * one near 1000 instead of a single one for the whole range.
 */
export const COUPON_BAND_CONFIG = {
  stepTl: 500,
  extraEdgesTl: [750],
  nestedUpToTl: 1500,
  stopTolerance: 0.05,
  minTicketTl: 20
} as const;

export interface CouponBand {
  minTl: number;
  maxTl: number;
}

export function buildCouponBands(
  maxBudgetTl: number
): CouponBand[] {
  const bands: CouponBand[] = [];

  const edges = new Set<number>(COUPON_BAND_CONFIG.extraEdgesTl);

  for (
    let edge = COUPON_BAND_CONFIG.stepTl;
    edge < maxBudgetTl - 1e-9;
    edge += COUPON_BAND_CONFIG.stepTl
  ) {
    edges.add(edge);
  }

  let minTl = 0;

  for (const edge of [...edges].sort((a, b) => a - b)) {
    if (edge >= maxBudgetTl - 1e-9) break;
    bands.push({ minTl, maxTl: edge });
    minTl = edge;
  }

  bands.push({ minTl, maxTl: maxBudgetTl });

  return bands;
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

  /*
   * The learned model score is already a within-race probability
   * distribution. Use it as it stands when the whole leg has it.
   */
  const modelled =
    ordered.every(
      runner =>
        runner.winProbability !=
          null &&
        Number.isFinite(
          runner.winProbability
        ) &&
        (
          runner
            .winProbability as number
        ) > 0
    );

  if (modelled) {
    const total =
      ordered.reduce(
        (sum, runner) =>
          sum +
          (
            runner
              .winProbability as number
          ),
        0
      );

    if (total > 0) {
      return ordered.map(
        runner => ({
          ...runner,

          probability:
            (
              runner
                .winProbability as number
            ) / total
        })
      );
    }
  }

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
  const runners =
    runnerProbabilities(
      leg.runners,
      temperature
    );

  let minCount = 1;

  /*
   * A forced horse moves up to second place, so taking the first n
   * horses always means "the best n-1 plus the forced one" and the
   * rest of the optimizer works unchanged.
   */
  const forcedIndex =
    leg.forcedHorseNumber == null
      ? -1
      : runners.findIndex(
          runner =>
            runner.horseNumber ===
            leg.forcedHorseNumber
        );

  if (forcedIndex >= 1) {
    const [forced] =
      runners.splice(forcedIndex, 1);

    runners.splice(1, 0, forced);
    minCount = 2;
  }

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

    runners,

    minCount
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


interface FrontierEntry {
  counts: number[];
  combinations: number;
  survival: number;
}

/*
 * Every affordable coupon shape, keyed by its combination count, with
 * the best survival probability for that count. The total count is the
 * product of the leg counts and the survival the product of the leg
 * coverages, so keeping the best entry per running product is exact.
 * minCounts lets a coupon be forced to contain a cheaper one.
 */
function couponFrontier(
  legs: PreparedLeg[],
  maxCombinations: number,
  minCounts: number[]
): FrontierEntry[] {
  let states =
    new Map<number, FrontierEntry>([
      [1, { counts: [], combinations: 1, survival: 1 }]
    ]);

  legs.forEach((leg, index) => {
    const coverage: number[] = [];
    let running = 0;

    for (const runner of leg.runners) {
      running += runner.probability;
      coverage.push(running);
    }

    const from =
      Math.max(leg.minCount, minCounts[index] ?? 1);

    const next =
      new Map<number, FrontierEntry>();

    for (const state of states.values()) {
      for (let count = from; count <= leg.runners.length; count += 1) {
        const combinations = state.combinations * count;

        if (combinations > maxCombinations) break;

        const survival = state.survival * coverage[count - 1];
        const current = next.get(combinations);

        if (!current || survival > current.survival + 1e-15) {
          next.set(combinations, {
            counts: [...state.counts, count],
            combinations,
            survival
          });
        }
      }
    }

    states = next;
  });

  return [...states.values()];
}

function bandCounts(
  legs: PreparedLeg[],
  band: CouponBand,
  unitPriceTl: number,
  multiplier: number,
  minCounts: number[]
): number[] {
  const combinationPrice =
    unitPriceTl * multiplier;

  const maxCombinations =
    Math.floor((band.maxTl + 1e-9) / combinationPrice);

  if (maxCombinations < 1) {
    throw new Error(
      `BUDGET_BELOW_MINIMUM:${combinationPrice}`
    );
  }

  const frontier =
    couponFrontier(legs, maxCombinations, minCounts);

  if (!frontier.length) {
    throw new Error(
      "NO_AFFORDABLE_COUPON"
    );
  }

  const top =
    frontier.reduce((best, item) =>
      item.survival > best.survival + 1e-15 ||
      (Math.abs(item.survival - best.survival) <= 1e-15 &&
        item.combinations > best.combinations)
        ? item
        : best
    );

  const minCombinations =
    Math.ceil(
      (Math.max(band.minTl, COUPON_BAND_CONFIG.minTicketTl) - 1e-9) /
      combinationPrice
    );

  const enough =
    frontier
      .filter(item =>
        item.combinations >= minCombinations &&
        item.survival >=
          (1 - COUPON_BAND_CONFIG.stopTolerance) * top.survival
      )
      .sort((a, b) =>
        a.combinations - b.combinations ||
        b.survival - a.survival
      );

  /* A small field can be fully covered below the band: keep its best. */
  return (enough[0] ?? top).counts;
}


function couponFromCounts(
  legs:
    PreparedLeg[],
  band:
    CouponBand,
  counts:
    number[],
  unitPriceTl:
    number,
  multiplier:
    number
): OptimizedSixFoldCoupon {
  const tierBudgetTl =
    band.maxTl;

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

    bandMinTl:
      Number(
        band.minTl.toFixed(2)
      ),

    targetBudgetTl:
      Number(
        tierBudgetTl
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
   * single amount to spend in full. See buildCouponBands above: it is
   * cut into 500 TL price bands up to this max, one coupon per band.
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

  const coupons: OptimizedSixFoldCoupon[] = [];
  let floors: number[] = [];
  let previous: number[] | null = null;

  for (const band of buildCouponBands(input.budgetTl)) {
    const nested =
      band.maxTl <= COUPON_BAND_CONFIG.nestedUpToTl + 1e-9;

    const counts =
      bandCounts(
        prepared,
        band,
        input.unitPriceTl,
        multiplier,
        nested ? floors : []
      );

    if (nested) floors = counts;

    /* A band that cannot improve on the previous coupon adds nothing. */
    if (previous && counts.every((count, index) => count === previous?.[index])) {
      continue;
    }

    previous = counts;

    coupons.push(
      couponFromCounts(
        prepared,
        band,
        counts,
        input.unitPriceTl,
        multiplier
      )
    );
  }

  return coupons;
}
