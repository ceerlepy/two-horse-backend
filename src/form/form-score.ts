import type {
  HorseFormResult,
  HorseHistoryRun
} from "./types";

import {
  clamp,
  round
} from "../scoring/math";

const RECENCY_WEIGHTS = [
  1.00,
  0.85,
  0.70,
  0.55,
  0.40
];

function positionScore(
  position: number
): number {
  if (position <= 1) {
    return 100;
  }

  if (position === 2) {
    return 86;
  }

  if (position === 3) {
    return 74;
  }

  if (position === 4) {
    return 62;
  }

  if (position === 5) {
    return 52;
  }

  if (position === 6) {
    return 42;
  }

  if (position === 7) {
    return 34;
  }

  if (position === 8) {
    return 27;
  }

  return 20;
}

function formTrend(
  positions: number[]
): HorseFormResult["trend"] {
  if (positions.length < 3) {
    return "unknown";
  }

  const recent =
    positions.slice(0, 2)
      .reduce(
        (a, b) => a + b,
        0
      ) / 2;

  const older =
    positions.slice(2)
      .reduce(
        (a, b) => a + b,
        0
      ) /
    positions.slice(2).length;

  /*
   * Lower finish position is better.
   */
  if (
    recent <=
    older - 1
  ) {
    return "improving";
  }

  if (
    recent >=
    older + 1
  ) {
    return "declining";
  }

  return "stable";
}

export function calculateForm(
  history: HorseHistoryRun[]
): HorseFormResult {
  const usable =
    history
      .filter(
        run =>
          run.finishPosition !== null &&
          run.finishPosition > 0
      )
      .slice(0, 5);

  if (!usable.length) {
    return {
      score: null,
      sampleSize: 0,
      recentPositions: [],
      trend: "unknown"
    };
  }

  let weightedTotal = 0;
  let totalWeight = 0;

  usable.forEach(
    (run, index) => {
      const weight =
        RECENCY_WEIGHTS[
          index
        ] ?? 0.30;

      weightedTotal +=
        positionScore(
          run.finishPosition!
        ) *
        weight;

      totalWeight +=
        weight;
    }
  );

  const positions =
    usable.map(
      run =>
        run.finishPosition!
    );

  const trend =
    formTrend(
      positions
    );

  let trendAdjustment = 0;

  if (
    trend === "improving"
  ) {
    trendAdjustment = 6;
  } else if (
    trend === "declining"
  ) {
    trendAdjustment = -6;
  }

  const score =
    clamp(
      (
        weightedTotal /
        totalWeight
      ) +
      trendAdjustment,
      0,
      100
    );

  return {
    score:
      round(
        score,
        1
      ),

    sampleSize:
      usable.length,

    recentPositions:
      positions,

    trend
  };
}
