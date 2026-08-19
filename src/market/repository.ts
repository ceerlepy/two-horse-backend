import type {
  Env
} from "../env";

import type {
  TjkProgramInput
} from "../types/models";

import type {
  AgfSnapshotPoint
} from "./types";

import {
  turkeyDate
} from "../shared";

export interface MarketSnapshotMap {
  [runnerKey: string]:
    AgfSnapshotPoint[];
}

export function marketRunnerKey(
  city: string,
  raceNumber: number,
  horseNumber: number
): string {
  return (
    `${city}|` +
    `${raceNumber}|` +
    `${horseNumber}`
  );
}

export async function recordAgfSnapshots(
  env: Env,
  program:
    TjkProgramInput
): Promise<number> {
  const date =
    turkeyDate();

  const capturedAt =
    new Date()
      .toISOString();

  const statements:
    D1PreparedStatement[] = [];

  for (
    const meeting of
    program.meetings
  ) {
    for (
      const race of
      meeting.races
    ) {
      for (
        const runner of
        race.runners
      ) {
        if (
          runner.agfPercent === null ||
          !Number.isFinite(
            runner.agfPercent
          ) ||
          runner.agfPercent < 0 ||
          runner.agfPercent > 100
        ) {
          continue;
        }

        statements.push(
          env.DB.prepare(`
            INSERT OR IGNORE
            INTO agf_market_snapshots(
              race_date,
              city,
              race_number,
              horse_number,
              agf_percent,
              captured_at
            )
            VALUES(
              ?,?,?,?,?,?
            )
          `)
            .bind(
              date,
              meeting.city,
              race.raceNumber,
              runner.number,
              runner.agfPercent,
              capturedAt
            )
        );
      }
    }
  }

  for (
    let index = 0;
    index <
      statements.length;
    index += 75
  ) {
    await env.DB.batch(
      statements.slice(
        index,
        index + 75
      )
    );
  }

  return statements.length;
}

export async function getTodayMarketSnapshots(
  env: Env
): Promise<MarketSnapshotMap> {
  const date =
    turkeyDate();

  const rows =
    await env.DB.prepare(`
      SELECT
        city,
        race_number,
        horse_number,
        agf_percent,
        captured_at
      FROM agf_market_snapshots
      WHERE race_date = ?
      ORDER BY
        city,
        race_number,
        horse_number,
        captured_at
    `)
      .bind(date)
      .all<any>();

  const result:
    MarketSnapshotMap = {};

  for (
    const row of
    rows.results ?? []
  ) {
    const key =
      marketRunnerKey(
        String(
          row.city
        ),
        Number(
          row.race_number
        ),
        Number(
          row.horse_number
        )
      );

    (
      result[key] ??= []
    ).push({
      agfPercent:
        Number(
          row.agf_percent
        ),

      capturedAt:
        String(
          row.captured_at
        )
    });
  }

  return result;
}

export async function cleanupMarketSnapshots(
  env: Env
): Promise<void> {
  await env.DB.prepare(`
    DELETE
    FROM agf_market_snapshots
    WHERE race_date <
      date(
        'now',
        '+3 hours',
        '-3 days'
      )
  `)
    .run();
}
