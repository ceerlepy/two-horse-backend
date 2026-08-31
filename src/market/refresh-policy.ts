import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

/*
 * TTL values are deliberately slightly below the desired cadence
 * because cron itself fires every 5m. Ordered farthest-first; the
 * first tier whose minMinutes the actual gap exceeds wins.
 *
 * > 6h       -> ~60m
 * 3h - 6h    -> ~30m
 * 90m - 3h   -> ~15m
 * <= 90m     -> liveWindowTtlMs (every 5m cron tick)
 */
export const TJK_MARKET_REFRESH_CONFIG = {
  noProgramYetTtlMs: 29 * 60 * 1000,
  noUpcomingRaceTtlMs: 59 * 60 * 1000,

  distanceTiers: [
    { minMinutes: 360, ttlMs: 59 * 60 * 1000, reason: "far" as const },
    { minMinutes: 180, ttlMs: 29 * 60 * 1000, reason: "approaching" as const },
    { minMinutes: 90, ttlMs: 14 * 60 * 1000, reason: "near" as const }
  ],

  liveWindowTtlMs: 4 * 60 * 1000
} as const;

export interface AdaptiveTjkPolicy {
  ttlMs: number;

  nextRaceMinutes:
    number | null;

  reason:
    | "no-program-yet"
    | "no-upcoming-race"
    | "far"
    | "approaching"
    | "near"
    | "live-window";
}

export async function adaptiveTjkPolicy(
  env: Env
): Promise<AdaptiveTjkPolicy> {
  const date =
    turkeyDate();

  const meeting =
    await env.DB.prepare(`
      SELECT 1 AS found
      FROM meetings
      WHERE race_date = ?
      LIMIT 1
    `)
      .bind(date)
      .first<any>();

  /*
   * Before today's program exists,
   * retry reasonably often.
   */
  if (!meeting) {
    return {
      ttlMs:
        TJK_MARKET_REFRESH_CONFIG.noProgramYetTtlMs,

      nextRaceMinutes:
        null,

      reason:
        "no-program-yet"
    };
  }

  const next =
    await env.DB.prepare(`
      SELECT starts_at
      FROM races
      WHERE race_date = ?
        AND starts_at > ?
      ORDER BY starts_at
      LIMIT 1
    `)
      .bind(
        date,
        new Date()
          .toISOString()
      )
      .first<any>();

  if (!next?.starts_at) {
    return {
      ttlMs:
        TJK_MARKET_REFRESH_CONFIG.noUpcomingRaceTtlMs,

      nextRaceMinutes:
        null,

      reason:
        "no-upcoming-race"
    };
  }

  const minutes =
    Math.max(
      0,
      (
        Date.parse(
          next.starts_at
        ) -
        Date.now()
      ) /
      60_000
    );

  const tier =
    TJK_MARKET_REFRESH_CONFIG.distanceTiers.find(
      candidate =>
        minutes > candidate.minMinutes
    );

  if (tier) {
    return {
      ttlMs:
        tier.ttlMs,

      nextRaceMinutes:
        minutes,

      reason:
        tier.reason
    };
  }

  return {
    ttlMs:
      TJK_MARKET_REFRESH_CONFIG.liveWindowTtlMs,

    nextRaceMinutes:
      minutes,

    reason:
      "live-window"
  };
}
