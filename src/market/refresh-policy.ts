import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

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
        29 * 60 * 1000,

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
        59 * 60 * 1000,

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

  /*
   * TTL values are deliberately slightly below the
   * desired cadence because cron itself fires every 5m.
   *
   * > 6h       -> ~60m
   * 3h - 6h    -> ~30m
   * 90m - 3h   -> ~15m
   * <= 90m     -> every 5m cron tick
   */
  if (minutes > 360) {
    return {
      ttlMs:
        59 * 60 * 1000,

      nextRaceMinutes:
        minutes,

      reason:
        "far"
    };
  }

  if (minutes > 180) {
    return {
      ttlMs:
        29 * 60 * 1000,

      nextRaceMinutes:
        minutes,

      reason:
        "approaching"
    };
  }

  if (minutes > 90) {
    return {
      ttlMs:
        14 * 60 * 1000,

      nextRaceMinutes:
        minutes,

      reason:
        "near"
    };
  }

  return {
    ttlMs:
      4 * 60 * 1000,

    nextRaceMinutes:
      minutes,

    reason:
      "live-window"
  };
}
