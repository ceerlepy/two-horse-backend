import {
  clamp,
  round
} from "../scoring/math";

export interface ParsedRecentForm {
  raw: string;

  /*
   * Most recent race first.
   */
  positions: number[];

  score: number | null;

  trend:
    | "improving"
    | "stable"
    | "declining"
    | "unknown";
}

const RECENCY_WEIGHTS = [
  1.00,
  0.85,
  0.70,
  0.55,
  0.40,
  0.30
];

function normalizePosition(
  digit: number
): number {
  /*
   * TJK uses 0 for finishes outside the
   * single-digit placing range / unplaced
   * representation in this compact field.
   *
   * Treat it conservatively as 10 for score.
   */
  return digit === 0
    ? 10
    : digit;
}

function positionScore(
  position: number
): number {
  switch (position) {
    case 1:
      return 100;

    case 2:
      return 86;

    case 3:
      return 74;

    case 4:
      return 62;

    case 5:
      return 52;

    case 6:
      return 43;

    case 7:
      return 35;

    case 8:
      return 28;

    case 9:
      return 22;

    default:
      return 16;
  }
}

function calculateTrend(
  positions: number[]
): ParsedRecentForm["trend"] {
  if (positions.length < 4) {
    return "unknown";
  }

  const recent =
    positions
      .slice(0, 2)
      .reduce(
        (sum, value) =>
          sum + value,
        0
      ) / 2;

  const olderValues =
    positions.slice(2);

  const older =
    olderValues.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    olderValues.length;

  /*
   * Lower placing is better.
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

export function parseRecentForm(
  value:
    string | null | undefined
): ParsedRecentForm {
  const raw =
    String(
      value ?? ""
    ).trim();

  if (!raw) {
    return {
      raw,
      positions: [],
      score: null,
      trend: "unknown"
    };
  }

  /*
   * Hyphens separate seasons/year groups in
   * TJK display. They are not finish positions.
   *
   * Keep only the compact placing digits.
   */
  const digits =
    raw
      .replace(
        /[^0-9]/g,
        ""
      )
      .slice(-6)
      .split("")
      .map(Number)
      .filter(
        value =>
          Number.isInteger(value)
      );

  if (!digits.length) {
    return {
      raw,
      positions: [],
      score: null,
      trend: "unknown"
    };
  }

  /*
   * TJK compact display is chronological
   * left -> right; rightmost value is the
   * most recent historical race.
   */
  const positions =
    digits
      .reverse()
      .map(
        normalizePosition
      );

  let weightedScore = 0;
  let totalWeight = 0;

  positions.forEach(
    (position, index) => {
      const weight =
        RECENCY_WEIGHTS[
          index
        ] ?? 0.25;

      weightedScore +=
        positionScore(
          position
        ) *
        weight;

      totalWeight +=
        weight;
    }
  );

  const trend =
    calculateTrend(
      positions
    );

  let trendAdjustment = 0;

  if (
    trend === "improving"
  ) {
    trendAdjustment = 5;
  } else if (
    trend === "declining"
  ) {
    trendAdjustment = -5;
  }

  return {
    raw,

    positions,

    score:
      round(
        clamp(
          (
            weightedScore /
            totalWeight
          ) +
          trendAdjustment,
          0,
          100
        ),
        1
      ),

    trend
  };
}

export function scoreRecentForm(
  value:
    string | null | undefined
): number | null {
  return parseRecentForm(
    value
  ).score;
}
