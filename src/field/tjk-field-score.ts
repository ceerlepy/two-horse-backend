import {
  clamp,
  round
} from "../scoring/math";

import type {
  TjkFieldHistoryRow
} from "./tjk-performance-parser";

/*
 * Every tunable for this feature lives here, in one place -- same
 * pattern as EXPERT_CHECK_CADENCE_TIERS in src/experts/policy.ts.
 *
 * finishPositionScores: a finish position's raw contribution to the
 * field score, 1st place strongest down to a shared "unplaced/
 * unknown" floor for position 0 or anything outside 1-9.
 *
 * recencyWeights: how much each of a horse's most recent races
 * (index 0 = newest) counts toward the blended score; also caps how
 * many past races are considered at all (its length).
 *
 * reliabilityDivisor: sample count needed to fully trust the raw
 * blended score instead of shrinking it toward a neutral 50 -- see
 * scoreTjkFieldHistory below.
 */
export const TJK_FIELD_SCORE_CONFIG = {
  finishPositionScores: {
    1: 100,
    2: 86,
    3: 74,
    4: 63,
    5: 53,
    6: 44,
    7: 36,
    8: 29,
    9: 23
  } as Record<number, number>,

  unplacedScore: 15,

  recencyWeights: [
    1.00,
    0.85,
    0.70,
    0.55,
    0.40
  ],

  reliabilityDivisor: 3
} as const;

function finishScore(
  position:
    number | null
): number | null {
  if (
    position === null
  ) {
    return null;
  }

  return (
    TJK_FIELD_SCORE_CONFIG
      .finishPositionScores[position] ??
    TJK_FIELD_SCORE_CONFIG.unplacedScore
  );
}

const RECENCY_WEIGHTS =
  TJK_FIELD_SCORE_CONFIG.recencyWeights;

export interface TjkFieldScore {
  score: number | null;
  sampleSize: number;
}

export function scoreTjkFieldHistory(
  input:
    TjkFieldHistoryRow[]
): TjkFieldScore {
  const usable =
    input
      .filter(
        row =>
          finishScore(
            row.finishPosition
          ) !== null
      )
      .sort(
        (a, b) =>
          Date.parse(
            b.raceDate ?? ""
          ) -
          Date.parse(
            a.raceDate ?? ""
          )
      )
      .slice(
        0,
        RECENCY_WEIGHTS.length
      );

  if (!usable.length) {
    return {
      score: null,
      sampleSize: 0
    };
  }

  let total = 0;
  let weightTotal = 0;

  usable.forEach(
    (row, index) => {
      const score =
        finishScore(
          row.finishPosition
        );

      if (
        score === null
      ) {
        return;
      }

      const weight =
        RECENCY_WEIGHTS[
          index
        ];

      total +=
        score *
        weight;

      weightTotal +=
        weight;
    }
  );

  const raw =
    total /
    weightTotal;

  /*
   * One historical run is useful but should not create
   * overconfidence.
   *
   * Shrink small samples toward neutral 50.
   */
  const reliability =
    clamp(
      usable.length /
        TJK_FIELD_SCORE_CONFIG.reliabilityDivisor,
      0,
      1
    );

  const score =
    50 +
    (
      raw - 50
    ) *
    reliability;

  return {
    score:
      round(
        clamp(
          score,
          0,
          100
        ),
        1
      ),

    sampleSize:
      usable.length
  };
}
