import {
  clamp,
  round
} from "../scoring/math";

import type {
  AgfSnapshotPoint,
  MarketMovement
} from "./types";

const MIN_SPAN_MS =
  4 * 60 * 1000;

function validPoint(
  point: AgfSnapshotPoint
): boolean {
  return (
    Number.isFinite(
      point.agfPercent
    ) &&
    point.agfPercent >= 0 &&
    point.agfPercent <= 100 &&
    Number.isFinite(
      Date.parse(
        point.capturedAt
      )
    )
  );
}

function classifyDirection(
  delta: number
): MarketMovement["direction"] {
  if (delta >= 5) {
    return "strong-up";
  }

  if (delta >= 1.5) {
    return "up";
  }

  if (delta <= -5) {
    return "strong-down";
  }

  if (delta <= -1.5) {
    return "down";
  }

  return "flat";
}

export function analyzeMarketMovement(
  input:
    AgfSnapshotPoint[]
): MarketMovement {
  const ordered =
    input
      .filter(
        validPoint
      )
      .sort(
        (a, b) =>
          Date.parse(
            a.capturedAt
          ) -
          Date.parse(
            b.capturedAt
          )
      );

  const unique:
    AgfSnapshotPoint[] = [];

  const seen =
    new Set<string>();

  for (
    const point of ordered
  ) {
    const key =
      `${point.capturedAt}|${point.agfPercent}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(point);
  }

  if (
    unique.length < 2
  ) {
    return {
      score: null,

      sampleSize:
        unique.length,

      firstAgf:
        unique[0]
          ?.agfPercent ??
        null,

      latestAgf:
        unique[0]
          ?.agfPercent ??
        null,

      absoluteDelta:
        null,

      relativeDelta:
        null,

      spanMinutes: 0,

      direction:
        "unknown"
    };
  }

  const first =
    unique[0];

  const latest =
    unique[
      unique.length - 1
    ];

  const spanMs =
    Date.parse(
      latest.capturedAt
    ) -
    Date.parse(
      first.capturedAt
    );

  const spanMinutes =
    Math.max(
      0,
      spanMs / 60_000
    );

  /*
   * Repeated/manual refreshes within a few seconds
   * must not masquerade as market movement.
   */
  if (
    spanMs <
    MIN_SPAN_MS
  ) {
    return {
      score: null,

      sampleSize:
        unique.length,

      firstAgf:
        first.agfPercent,

      latestAgf:
        latest.agfPercent,

      absoluteDelta:
        null,

      relativeDelta:
        null,

      spanMinutes:
        round(
          spanMinutes,
          1
        ),

      direction:
        "unknown"
    };
  }

  const absoluteDelta =
    latest.agfPercent -
    first.agfPercent;

  /*
   * Floor denominator to avoid tiny starting AGFs
   * generating absurd relative-change values.
   */
  const relativeDelta =
    absoluteDelta /
    Math.max(
      first.agfPercent,
      5
    );

  const absoluteSignal =
    clamp(
      absoluteDelta / 10,
      -1,
      1
    );

  const relativeSignal =
    clamp(
      relativeDelta / 0.50,
      -1,
      1
    );

  /*
   * Neutral = 50.
   *
   * Absolute movement has more influence
   * than relative movement.
   */
  const score =
    50 +
    30 * absoluteSignal +
    20 * relativeSignal;

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
      unique.length,

    firstAgf:
      first.agfPercent,

    latestAgf:
      latest.agfPercent,

    absoluteDelta:
      round(
        absoluteDelta,
        2
      ),

    relativeDelta:
      round(
        relativeDelta,
        3
      ),

    spanMinutes:
      round(
        spanMinutes,
        1
      ),

    direction:
      classifyDirection(
        absoluteDelta
      )
  };
}

export function scoreMarketMovement(
  input:
    AgfSnapshotPoint[]
): number | null {
  return (
    analyzeMarketMovement(
      input
    ).score
  );
}
