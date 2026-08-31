import {
  clamp,
  round
} from "../scoring/math";

import type {
  HorseModelScore
} from "../scoring/types";


export interface ContextPrior {
  sampleSize: number;
  winRate: number;
  top3Rate: number;
}


export interface GlobalOutcomeRates {
  winRate: number;
  top3Rate: number;
}


/*
 * Every tunable for entity-context learning (horse/jockey/pair)
 * lives here, in one place -- same pattern as EXPERT_CHECK_CADENCE_
 * TIERS in src/experts/policy.ts.
 *
 * contextPriors: per-entity-type (minSamples, fullReliabilityAt,
 * blendWeight). Horse-jockey pair data is the sparsest, so it
 * demands more evidence (a higher minSamples-to-fullReliability
 * ratio) than a one-off win, and carries the smallest blend weight.
 *
 * relativeQualityWeights: winning matters most; top-3 stabilises a
 * noisy sparse sample.
 *
 * rawSignalScale / rawSignalClamp: how much a relativeQuality of,
 * say, 1.2 (20% better than baseline) turns into before reliability
 * shrinkage -- (quality-1)*rawSignalScale, clamped to +/-rawSignalClamp.
 *
 * finalAdjustmentClamp: the outer production safety boundary, after
 * blending and the runtime safety scale -- race-day model remains
 * primary.
 */
export const LEARNING_ADJUSTMENT_CONFIG = {
  contextPriors: {
    horse: { minSamples: 6, fullReliabilityAt: 20, blendWeight: 0.50 },
    jockey: { minSamples: 20, fullReliabilityAt: 80, blendWeight: 0.30 },
    pair: { minSamples: 5, fullReliabilityAt: 15, blendWeight: 0.20 }
  },

  relativeQualityWeights: {
    win: 0.60,
    top3: 0.40
  },

  rawSignalScale: 20,
  rawSignalClamp: 12,

  finalAdjustmentClamp: 5
} as const;


function learnedSignal(
  prior:
    ContextPrior | null,
  global:
    GlobalOutcomeRates,
  minSamples: number,
  fullReliabilityAt: number
): number | null {
  if (
    prior == null ||
    prior.sampleSize <
      minSamples
  ) {
    return null;
  }

  /*
   * Compare against observed database baseline,
   * not an arbitrary fixed win-rate.
   */
  const winRatio =
    global.winRate > 0
      ? prior.winRate /
        global.winRate
      : 1;

  const top3Ratio =
    global.top3Rate > 0
      ? prior.top3Rate /
        global.top3Rate
      : 1;

  /*
   * Winning matters most;
   * top-3 stabilises a noisy sparse sample.
   */
  const relativeQuality =
    LEARNING_ADJUSTMENT_CONFIG.relativeQualityWeights.win *
      winRatio +
    LEARNING_ADJUSTMENT_CONFIG.relativeQualityWeights.top3 *
      top3Ratio;

  /*
   * quality=1 => neutral.
   *
   * Clamp individual learned context before
   * combining anything.
   */
  const raw =
    clamp(
      (
        relativeQuality -
        1
      ) * LEARNING_ADJUSTMENT_CONFIG.rawSignalScale,
      -LEARNING_ADJUSTMENT_CONFIG.rawSignalClamp,
      LEARNING_ADJUSTMENT_CONFIG.rawSignalClamp
    );

  /*
   * Shrink small samples strongly toward zero.
   */
  const reliability =
    clamp(
      (
        prior.sampleSize -
        minSamples +
        1
      ) /
      (
        fullReliabilityAt -
        minSamples +
        1
      ),
      0,
      1
    );

  return raw *
    reliability;
}


export function applyLearningAdjustment(
  score:
    HorseModelScore,
  input: {
    global:
      GlobalOutcomeRates;

    horse:
      ContextPrior | null;

    jockey:
      ContextPrior | null;

    pair:
      ContextPrior | null;

    /*
     * Runtime safety gate.
     * Never allowed to amplify learning above 1.
     */
    scale?: number;
  }
): HorseModelScore & {
  baseScore: number;
  learningAdjustment: number;
} {
  const horseConfig =
    LEARNING_ADJUSTMENT_CONFIG.contextPriors.horse;

  const jockeyConfig =
    LEARNING_ADJUSTMENT_CONFIG.contextPriors.jockey;

  const pairConfig =
    LEARNING_ADJUSTMENT_CONFIG.contextPriors.pair;

  const horse =
    learnedSignal(
      input.horse,
      input.global,
      horseConfig.minSamples,
      horseConfig.fullReliabilityAt
    );

  const jockey =
    learnedSignal(
      input.jockey,
      input.global,
      jockeyConfig.minSamples,
      jockeyConfig.fullReliabilityAt
    );

  /*
   * Horse-jockey pair data is very sparse.
   * Demand more evidence than a one-off win.
   */
  const pair =
    learnedSignal(
      input.pair,
      input.global,
      pairConfig.minSamples,
      pairConfig.fullReliabilityAt
    );

  const available =
    [
      horse == null
        ? null
        : {
            value: horse,
            weight: horseConfig.blendWeight as number
          },

      jockey == null
        ? null
        : {
            value: jockey,
            weight: jockeyConfig.blendWeight as number
          },

      pair == null
        ? null
        : {
            value: pair,
            weight: pairConfig.blendWeight as number
          }
    ]
      .filter(
        (
          item
        ): item is {
          value: number;
          weight: number;
        } =>
          item != null
      );

  if (!available.length) {
    return {
      ...score,

      baseScore:
        score.score,

      learningAdjustment:
        0
    };
  }

  const totalWeight =
    available.reduce(
      (sum, item) =>
        sum +
        item.weight,
      0
    );

  const combined =
    available.reduce(
      (sum, item) =>
        sum +
        item.value *
          item.weight,
      0
    ) /
    totalWeight;

  /*
   * Production safety boundary.
   *
   * Race-day model remains primary.
   */
  const safetyScale =
    clamp(
      input.scale ??
        1,
      0,
      1
    );

  const adjustment =
    round(
      clamp(
        combined *
          safetyScale,
        -LEARNING_ADJUSTMENT_CONFIG.finalAdjustmentClamp,
        LEARNING_ADJUSTMENT_CONFIG.finalAdjustmentClamp
      ),
      2
    );

  return {
    ...score,

    baseScore:
      round(
        score.score,
        2
      ),

    learningAdjustment:
      adjustment,

    score:
      round(
        clamp(
          score.score +
            adjustment,
          0,
          100
        ),
        2
      )
  };
}


/*
 * Expert calibration changes only that source's own expert weight,
 * comparing its overall (not per-category) hit rate against the
 * global runner average -- see EXPERT_CATEGORY_CALIBRATION_CONFIG
 * in expert-category.ts for its narrower, per-category sibling.
 *
 * Never more than +/-15%.
 */
export const EXPERT_WEIGHT_CONFIG = {
  minSampleSize: 30,
  fullReliabilityAt: 150,

  relativeQualityWeights: {
    win: 0.65,
    top3: 0.35
  },

  adjustmentCap: 0.15
} as const;

export function expertWeightMultiplier(
  input: {
    sampleSize: number;
    winRate: number;
    top3Rate: number;
  } | null,
  global:
    GlobalOutcomeRates
): number {
  if (
    input == null ||
    input.sampleSize <
      EXPERT_WEIGHT_CONFIG.minSampleSize
  ) {
    return 1;
  }

  const winRatio =
    global.winRate > 0
      ? input.winRate /
        global.winRate
      : 1;

  const top3Ratio =
    global.top3Rate > 0
      ? input.top3Rate /
        global.top3Rate
      : 1;

  const relative =
    EXPERT_WEIGHT_CONFIG.relativeQualityWeights.win *
      winRatio +
    EXPERT_WEIGHT_CONFIG.relativeQualityWeights.top3 *
      top3Ratio;

  const reliability =
    clamp(
      (
        input.sampleSize -
        (
          EXPERT_WEIGHT_CONFIG.minSampleSize -
          1
        )
      ) /
      (
        EXPERT_WEIGHT_CONFIG.fullReliabilityAt -
        (
          EXPERT_WEIGHT_CONFIG.minSampleSize -
          1
        )
      ),
      0,
      1
    );

  const adjustment =
    clamp(
      (
        relative -
        1
      ) *
        EXPERT_WEIGHT_CONFIG.adjustmentCap *
        reliability,
      -EXPERT_WEIGHT_CONFIG.adjustmentCap,
      EXPERT_WEIGHT_CONFIG.adjustmentCap
    );

  return round(
    1 +
      adjustment,
    4
  );
}
