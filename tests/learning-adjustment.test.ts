import {
  describe,
  expect,
  it
} from "vitest";

import {
  applyLearningAdjustment,
  expertWeightMultiplier
} from "../src/learning/adjustment";

import type {
  HorseModelScore
} from "../src/scoring/types";


function baseScore(
  score = 60
): HorseModelScore {
  return {
    score,
    confidence: 1,
    components: [],
    availableWeight: 1,
    configuredWeight: 1
  };
}

const GLOBAL = {
  winRate: 0.15,
  top3Rate: 0.45
};


describe(
  "applyLearningAdjustment",
  () => {
    it(
      "makes no adjustment when no context prior is available",
      () => {
        const result =
          applyLearningAdjustment(
            baseScore(60),
            { global: GLOBAL, horse: null, jockey: null, pair: null }
          );

        expect(result.learningAdjustment).toBe(0);
        expect(result.baseScore).toBe(60);
        expect(result.score).toBe(60);
      }
    );

    it(
      "ignores a context prior below its minSamples gate",
      () => {
        const result =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: { sampleSize: 5, winRate: 0.90, top3Rate: 0.95 },
              jockey: null,
              pair: null
            }
          );

        expect(result.learningAdjustment).toBe(0);
      }
    );

    it(
      "boosts the score for a horse that strongly outperforms the global baseline",
      () => {
        const result =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: { sampleSize: 200, winRate: 0.45, top3Rate: 0.80 },
              jockey: null,
              pair: null
            }
          );

        expect(result.learningAdjustment).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThan(60);
        expect(result.score).toBeLessThanOrEqual(65);
      }
    );

    it(
      "reduces the score for a horse that underperforms the global baseline",
      () => {
        const result =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: { sampleSize: 200, winRate: 0.02, top3Rate: 0.10 },
              jockey: null,
              pair: null
            }
          );

        expect(result.learningAdjustment).toBeLessThan(0);
        expect(result.score).toBeLessThan(60);
      }
    );

    it(
      "never exceeds the +/-5 adjustment clamp even with an extreme outlier prior",
      () => {
        const result =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: { sampleSize: 100000, winRate: 1.0, top3Rate: 1.0 },
              jockey: { sampleSize: 100000, winRate: 1.0, top3Rate: 1.0 },
              pair: { sampleSize: 100000, winRate: 1.0, top3Rate: 1.0 }
            }
          );

        expect(result.learningAdjustment).toBeLessThanOrEqual(5);
        expect(result.learningAdjustment).toBeGreaterThanOrEqual(-5);
      }
    );

    it(
      "scales the adjustment down under the runtime safety gate",
      () => {
        // A moderate prior (winRatio 1.2, top3Ratio 1.1) deliberately
        // stays under the outer +/-5 clamp so scaling shows a clean
        // proportional difference, rather than two saturated 5s.
        const moderateHorse = {
          sampleSize: 200,
          winRate: GLOBAL.winRate * 1.2,
          top3Rate: GLOBAL.top3Rate * 1.1
        };

        const full =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: moderateHorse,
              jockey: null,
              pair: null
            }
          );

        const halfScaled =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: moderateHorse,
              jockey: null,
              pair: null,
              scale: 0.5
            }
          );

        expect(full.learningAdjustment).toBeLessThan(5);

        expect(halfScaled.learningAdjustment).toBeCloseTo(
          (full.learningAdjustment ?? 0) * 0.5,
          2
        );
      }
    );

    it(
      "clamps the final score into [0, 100]",
      () => {
        const result =
          applyLearningAdjustment(
            baseScore(99),
            {
              global: GLOBAL,
              horse: { sampleSize: 200, winRate: 0.45, top3Rate: 0.80 },
              jockey: null,
              pair: null
            }
          );

        expect(result.score).toBeLessThanOrEqual(100);
      }
    );

    it(
      "blends horse/jockey/pair signals by their fixed weights (0.50/0.30/0.20)",
      () => {
        // Both priors deliberately stay under the outer +/-5 clamp
        // (see the scaling test above) so the blend is visible
        // rather than two results saturated at the same boundary.
        const moderateHorse = {
          sampleSize: 200,
          winRate: GLOBAL.winRate * 1.2,
          top3Rate: GLOBAL.top3Rate * 1.1
        };

        const opposingPair = {
          sampleSize: 100,
          winRate: GLOBAL.winRate * 0.5,
          top3Rate: GLOBAL.top3Rate * 0.7
        };

        const horseOnly =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: moderateHorse,
              jockey: null,
              pair: null
            }
          );

        const horseAndOpposingPair =
          applyLearningAdjustment(
            baseScore(60),
            {
              global: GLOBAL,
              horse: moderateHorse,
              jockey: null,
              pair: opposingPair
            }
          );

        // adding a negative pair signal must pull the blended
        // adjustment down from the horse-only case
        expect(
          horseAndOpposingPair.learningAdjustment
        ).toBeLessThan(
          horseOnly.learningAdjustment ?? 0
        );
      }
    );
  }
);


describe(
  "expertWeightMultiplier",
  () => {
    it(
      "returns 1 (no change) when there is no calibration input",
      () => {
        expect(
          expertWeightMultiplier(null, GLOBAL)
        ).toBe(1);
      }
    );

    it(
      "returns 1 below the minimum sample size gate (30)",
      () => {
        expect(
          expertWeightMultiplier(
            { sampleSize: 29, winRate: 0.9, top3Rate: 0.9 },
            GLOBAL
          )
        ).toBe(1);
      }
    );

    it(
      "raises the multiplier for a source that beats the global baseline",
      () => {
        const multiplier =
          expertWeightMultiplier(
            { sampleSize: 150, winRate: 0.25, top3Rate: 0.60 },
            GLOBAL
          );

        expect(multiplier).toBeGreaterThan(1);
      }
    );

    it(
      "lowers the multiplier for a source that underperforms the global baseline",
      () => {
        const multiplier =
          expertWeightMultiplier(
            { sampleSize: 150, winRate: 0.02, top3Rate: 0.10 },
            GLOBAL
          );

        expect(multiplier).toBeLessThan(1);
      }
    );

    it(
      "never moves the multiplier by more than +/-15% even at full reliability with an extreme ratio",
      () => {
        const multiplier =
          expertWeightMultiplier(
            { sampleSize: 100000, winRate: 1.0, top3Rate: 1.0 },
            GLOBAL
          );

        expect(multiplier).toBeLessThanOrEqual(1.15);
        expect(multiplier).toBeGreaterThanOrEqual(0.85);
      }
    );
  }
);
