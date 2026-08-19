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
    0.60 * winRatio +
    0.40 * top3Ratio;

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
      ) * 20,
      -12,
      12
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
  const horse =
    learnedSignal(
      input.horse,
      input.global,
      6,
      20
    );

  const jockey =
    learnedSignal(
      input.jockey,
      input.global,
      20,
      80
    );

  /*
   * Horse-jockey pair data is very sparse.
   * Demand more evidence than a one-off win.
   */
  const pair =
    learnedSignal(
      input.pair,
      input.global,
      5,
      15
    );

  const available =
    [
      horse == null
        ? null
        : {
            value: horse,
            weight: 0.50
          },

      jockey == null
        ? null
        : {
            value: jockey,
            weight: 0.30
          },

      pair == null
        ? null
        : {
            value: pair,
            weight: 0.20
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
        -5,
        5
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
 * Expert calibration changes only that source's
 * own expert weight.
 *
 * Never more than +/-15%.
 */
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
    input.sampleSize < 30
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
    0.65 *
      winRatio +
    0.35 *
      top3Ratio;

  const reliability =
    clamp(
      (
        input.sampleSize -
        29
      ) /
      121,
      0,
      1
    );

  const adjustment =
    clamp(
      (
        relative -
        1
      ) *
        0.15 *
        reliability,
      -0.15,
      0.15
    );

  return round(
    1 +
      adjustment,
    4
  );
}
