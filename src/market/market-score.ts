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

export interface MarketWindowOptions {
  raceStartsAt?: string | null;

  /*
   * Final pre-race movement window.
   */
  windowMinutes?: number;
}

export function analyzeMarketMovement(
  input:
    AgfSnapshotPoint[],
  options:
    MarketWindowOptions = {}
): MarketMovement {
  const raceStartsAt =
    options.raceStartsAt
      ? Date.parse(
          options.raceStartsAt
        )
      : NaN;

  const windowMinutes =
    options.windowMinutes ??
    90;

  const windowStart =
    Number.isFinite(
      raceStartsAt
    )
      ? raceStartsAt -
        windowMinutes *
        60_000
      : NaN;

  const ordered =
    input
      .filter(
        validPoint
      )
      .filter(
        point => {
          if (
            !Number.isFinite(
              raceStartsAt
            )
          ) {
            return true;
          }

          const capturedAt =
            Date.parse(
              point.capturedAt
            );

          /*
           * Strictly pre-race.
           *
           * Ignore observations:
           * - after race start
           * - older than final market window
           */
          return (
            capturedAt <=
              raceStartsAt &&
            capturedAt >=
              windowStart
          );
        }
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
    AgfSnapshotPoint[],
  options:
    MarketWindowOptions = {}
): number | null {
  return (
    analyzeMarketMovement(
      input,
      options
    ).score
  );
}
