import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  generateFiveFoldCoupons,
  generateSixFoldCoupons
} from "./service";

import {
  resolveFiveFoldWindows,
  resolveSixFoldWindows
} from "./windows";

/*
 * Coupon snapshots used to be stored only when someone generated a
 * coupon through the admin POST, so between Aug 20 and Oct 4 only 6
 * altılı and 0 beşli rows existed and coupon calibration never got
 * samples. The cron now freezes one ladder of coupons per window,
 * once, in the last minutes before its first leg (so it is an honest
 * pre-race prediction), and the existing evaluatePending*Coupons
 * steps grade it after the last leg's result lands.
 *
 * Bounded: at most one ladder (a handful of budget tiers) per
 * pool/window/meeting/day, and rows older than retentionDays are
 * deleted, so the tables stay a few thousand rows.
 */
export const COUPON_CAPTURE_CONFIG = {
  /* Gold's max budget, so the ladder matches what members see. */
  budgetTl: 1500,
  captureBeforeFirstLegMinutes: 15,
  retentionDays: 365
} as const;

type Pool =
  | "sixfold"
  | "fivefold";

function explicitStarts(
  races: any[],
  column: string
): Array<{ windowNumber: number; startRace: number }> {
  return races.flatMap(
    race => {
      let values: unknown = [];

      try {
        values =
          JSON.parse(
            String(race[column] ?? "[]")
          );
      } catch {
        values = [];
      }

      return Array.isArray(values)
        ? values
          .map(Number)
          .filter(
            value =>
              value === 1 ||
              value === 2
          )
          .map(
            windowNumber => ({
              windowNumber,
              startRace:
                Number(race.race_number)
            })
          )
        : [];
    }
  );
}

/*
 * Same window resolution generate*Coupons uses, without building
 * any coupon, so the cron only pays for generation when a window's
 * first leg is actually due.
 */
export function couponWindows(
  races: any[]
): Array<{
  pool: Pool;
  windowNumber: number;
  startRace: number;
}> {
  const raceNumbers =
    races.map(
      race =>
        Number(race.race_number)
    );

  const six =
    races.length >= 6
      ? resolveSixFoldWindows(
        raceNumbers,
        explicitStarts(
          races,
          "sixfold_start_numbers_json"
        ).map(
          item => ({
            sixfold: item.windowNumber,
            startRace: item.startRace
          })
        )
      )
      : [];

  const five =
    races.length >= 5
      ? resolveFiveFoldWindows(
        raceNumbers,
        explicitStarts(
          races,
          "fivefold_start_numbers_json"
        ).map(
          item => ({
            fivefold: item.windowNumber,
            startRace: item.startRace
          })
        )
      )
      : [];

  return [
    ...six.map(
      window => ({
        pool: "sixfold" as Pool,
        windowNumber: window.sixfold,
        startRace: window.startRace
      })
    ),
    ...five.map(
      window => ({
        pool: "fivefold" as Pool,
        windowNumber: window.fivefold,
        startRace: window.startRace
      })
    )
  ];
}

function minutesUntil(
  startsAt: unknown,
  now: number
): number | null {
  const parsed =
    Date.parse(
      String(startsAt ?? "")
    );

  return Number.isFinite(parsed)
    ? (parsed - now) / 60_000
    : null;
}

export function isCaptureDue(
  minutesToFirstLeg: number | null
): boolean {
  return (
    minutesToFirstLeg !== null &&
    minutesToFirstLeg > 0 &&
    minutesToFirstLeg <=
      COUPON_CAPTURE_CONFIG.captureBeforeFirstLegMinutes
  );
}

async function alreadyCaptured(
  env: Env,
  pool: Pool,
  raceDate: string,
  city: string,
  windowNumber: number
): Promise<boolean> {
  const table =
    pool === "sixfold"
      ? "sixfold_coupon_snapshots"
      : "fivefold_coupon_snapshots";

  const column =
    pool === "sixfold"
      ? "sixfold_number"
      : "fivefold_number";

  const row =
    await env.DB.prepare(`
      SELECT 1 AS found
      FROM ${table}
      WHERE race_date = ? AND city = ? AND ${column} = ?
      LIMIT 1
    `)
      .bind(raceDate, city, windowNumber)
      .first<any>();

  return Boolean(row?.found);
}

async function generate(
  env: Env,
  pool: Pool,
  city: string,
  windowNumber: number,
  persistSnapshot: boolean
): Promise<any> {
  return pool === "sixfold"
    ? generateSixFoldCoupons(
      env,
      {
        city,
        budgetTl:
          COUPON_CAPTURE_CONFIG.budgetTl,
        sixfold:
          windowNumber,
        persistSnapshot
      }
    )
    : generateFiveFoldCoupons(
      env,
      {
        city,
        budgetTl:
          COUPON_CAPTURE_CONFIG.budgetTl,
        fivefold:
          windowNumber,
        persistSnapshot
      }
    );
}

export async function cleanupCouponSnapshots(
  env: Env
): Promise<void> {
  const cutoff =
    `-${COUPON_CAPTURE_CONFIG.retentionDays} days`;

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM sixfold_leg_calibration_samples
      WHERE snapshot_id IN (
        SELECT id FROM sixfold_coupon_snapshots
        WHERE race_date < date('now', ?)
      )
    `).bind(cutoff),
    env.DB.prepare(`
      DELETE FROM sixfold_coupon_snapshots
      WHERE race_date < date('now', ?)
    `).bind(cutoff),
    env.DB.prepare(`
      DELETE FROM fivefold_leg_calibration_samples
      WHERE snapshot_id IN (
        SELECT id FROM fivefold_coupon_snapshots
        WHERE race_date < date('now', ?)
      )
    `).bind(cutoff),
    env.DB.prepare(`
      DELETE FROM fivefold_coupon_snapshots
      WHERE race_date < date('now', ?)
    `).bind(cutoff)
  ]);
}

export async function captureCouponSnapshotsDue(
  env: Env
): Promise<any> {
  const now =
    Date.now();

  const raceDate =
    turkeyDate();

  /*
   * Plain race rows, not getToday(): this runs on every tick and
   * only needs start times and window metadata.
   */
  const raceRows =
    (
      await env.DB.prepare(`
        SELECT
          city,
          race_number,
          starts_at,
          sixfold_start_numbers_json,
          fivefold_start_numbers_json
        FROM races
        WHERE race_date = ?
        ORDER BY city, race_number
      `)
        .bind(raceDate)
        .all<any>()
    ).results ?? [];

  const meetings =
    [...raceRows.reduce(
      (byCity, race) => {
        const city =
          String(race.city);

        byCity.set(
          city,
          [...(byCity.get(city) ?? []), race]
        );

        return byCity;
      },
      new Map<string, any[]>()
    )].map(
      ([city, races]) => ({
        city,
        races
      })
    );

  const captured:
    string[] = [];

  const skipped:
    string[] = [];

  for (
    const meeting of
    meetings
  ) {
    const races:
      any[] =
      meeting.races ?? [];

    const city =
      String(meeting.city);

    for (
      const window of
      couponWindows(races)
    ) {
      const label =
        `${city}:${window.pool}:${window.windowNumber}`;

      const firstLeg =
        races.find(
          race =>
            Number(race.race_number) ===
            window.startRace
        );

      if (
        !isCaptureDue(
          minutesUntil(
            firstLeg?.starts_at,
            now
          )
        ) ||
        await alreadyCaptured(
          env,
          window.pool,
          raceDate,
          city,
          window.windowNumber
        )
      ) {
        continue;
      }

      try {
        const result =
          await generate(
            env,
            window.pool,
            city,
            window.windowNumber,
            true
          );

        if (result.snapshotPersisted) {
          captured.push(label);
        } else {
          skipped.push(
            `${label}:${result.snapshotPersistenceReason}`
          );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        skipped.push(
          `${label}:${message.slice(0, 120)}`
        );
      }
    }
  }

  if (captured.length) {
    await cleanupCouponSnapshots(env);
  }

  return {
    captured,
    skipped
  };
}
