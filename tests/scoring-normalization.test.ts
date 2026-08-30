import {
  describe,
  expect,
  it
} from "vitest";

import {
  scoreHorse
} from "../src/scoring/horse-score";

import {
  SCORING_WEIGHTS,
  TOTAL_SCORING_WEIGHT
} from "../src/scoring/weights";

import type {
  ScoringRunner
} from "../src/scoring/types";


function consensus(
  expertScore: number,
  sourceCount = 3,
  supportConfidence = 0.7
) {
  return {
    sourceCount,

    bankoCount: 0,
    favoriteCount: 0,
    strongCount: 0,
    starCount: 0,
    rivalCount: 0,
    surpriseCount: 0,
    avoidCount: 0,

    weightedBanko: 0,
    weightedFavorite: 0,
    weightedStrong: 0,
    weightedStar: 0,
    weightedRival: 0,
    weightedSurprise: 0,
    weightedAvoid: 0,

    weightedSupport: 0,
    weightedOpposition: 0,

    expertScore,
    supportConfidence,

    labels: []
  };
}


/*
 * Part 10 asks scoring to normalize weight across whatever features
 * are actually available rather than let a missing signal act as a
 * silent zero. horse-score.ts already implements this (per-item
 * null exclusion + weight renormalization); these tests lock that
 * behavior in as an explicit acceptance contract rather than an
 * incidental side effect of Part 9's field-coverage work.
 */
describe(
  "scoring weight normalization (Part 10)",
  () => {
    it(
      "does not penalize horses vs each other when expert data is meeting-wide unavailable",
      () => {
        const runnerA:
          ScoringRunner = {
            horse_number: 1,
            agf_percent: 40,
            hp: 90,
            weight: 55,
            recent_form_raw: "1123",
            market_score: 60,
            field_score: 55,
            expertConsensus:
              consensus(0, 0)
          };

        const runnerB:
          ScoringRunner = {
            horse_number: 2,
            agf_percent: 10,
            hp: 50,
            weight: 60,
            recent_form_raw: "7654",
            market_score: 45,
            field_score: 45,
            expertConsensus:
              consensus(0, 0)
          };

        const raceRunners =
          [runnerA, runnerB];

        const scoreA =
          scoreHorse(
            runnerA,
            raceRunners
          );

        const scoreB =
          scoreHorse(
            runnerB,
            raceRunners
          );

        const expertComponentA =
          scoreA.components.find(
            item => item.key === "expert"
          );

        expect(expertComponentA?.score)
          .toBeNull();

        expect(expertComponentA?.effectiveWeight)
          .toBe(0);

        /*
         * Stronger agf/hp/form/weight signals should still win out
         * -- missing expert data removes a dimension for both
         * horses equally, it does not flatten or invert the
         * comparison.
         */
        expect(scoreA.score)
          .toBeGreaterThan(
            scoreB.score
          );

        /*
         * Confirms renormalization actually happened rather than
         * expert silently scoring as 0: excluding expert's 22
         * points from the denominator recovers full confidence
         * from the remaining components, not a partial one.
         */
        expect(scoreA.confidence)
          .toBe(
            round3(
              (
                TOTAL_SCORING_WEIGHT -
                SCORING_WEIGHTS.expert
              ) /
              TOTAL_SCORING_WEIGHT
            )
          );
      }
    );


    it(
      "gives lower confidence to a horse with fewer available features than one with more",
      () => {
        const wellCovered:
          ScoringRunner = {
            horse_number: 1,
            agf_percent: 30,
            hp: 80,
            weight: 55,
            recent_form_raw: "1234",
            market_score: 60,
            field_score: 70,
            expertConsensus:
              consensus(65)
          };

        const sparselyCovered:
          ScoringRunner = {
            horse_number: 2,
            agf_percent: 30,
            hp: null,
            weight: 55,
            recent_form_raw: null,
            market_score: null,
            field_score: null,
            expertConsensus:
              consensus(0, 0)
          };

        const raceRunners =
          [wellCovered, sparselyCovered];

        const wellScore =
          scoreHorse(
            wellCovered,
            raceRunners
          );

        const sparseScore =
          scoreHorse(
            sparselyCovered,
            raceRunners
          );

        expect(sparseScore.confidence)
          .toBeLessThan(
            wellScore.confidence
          );
      }
    );


    it(
      "keeps full-coverage scoring numerically identical to a plain configured-weight average",
      () => {
        const runner:
          ScoringRunner = {
            horse_number: 1,
            agf_percent: 40,
            hp: 90,
            weight: 55,
            recent_form_raw: "1123",
            market_score: 72,
            field_score: 64,
            expertConsensus:
              consensus(80)
          };

        const other:
          ScoringRunner = {
            horse_number: 2,
            agf_percent: 20,
            hp: 60,
            weight: 60,
            recent_form_raw: "5566",
            market_score: 40,
            field_score: 50,
            expertConsensus:
              consensus(40)
          };

        const raceRunners =
          [runner, other];

        const result =
          scoreHorse(
            runner,
            raceRunners
          );

        expect(result.availableWeight)
          .toBe(TOTAL_SCORING_WEIGHT);

        expect(result.confidence)
          .toBe(1);

        const expected =
          result.components.reduce(
            (sum, item) =>
              sum +
              (item.score ?? 0) *
                item.configuredWeight,
            0
          ) /
          TOTAL_SCORING_WEIGHT;

        expect(result.score)
          .toBeCloseTo(expected, 2);
      }
    );
  }
);


function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
