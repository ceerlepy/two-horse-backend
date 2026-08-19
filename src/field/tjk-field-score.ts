import {
  clamp,
  round
} from "../scoring/math";

import type {
  TjkFieldHistoryRow
} from "./tjk-performance-parser";

function finishScore(
  position:
    number | null
): number | null {
  if (
    position === null
  ) {
    return null;
  }

  switch (
    position
  ) {
    case 1:
      return 100;

    case 2:
      return 86;

    case 3:
      return 74;

    case 4:
      return 63;

    case 5:
      return 53;

    case 6:
      return 44;

    case 7:
      return 36;

    case 8:
      return 29;

    case 9:
      return 23;

    case 0:
      return 15;

    default:
      return 15;
  }
}

const RECENCY_WEIGHTS = [
  1.00,
  0.85,
  0.70,
  0.55,
  0.40
];

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
      usable.length / 3,
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
