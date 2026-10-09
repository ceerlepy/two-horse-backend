import type {
  Env
} from "../env";

import {
  turkeyDate,
  turkeyDateTime
} from "../shared";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  parseOfficialResultsHtml
} from "../results/parser";

import {
  buildOfficialResultsCityUrl
} from "../results/url";

import type {
  OfficialRaceResult
} from "../results/types";

import {
  acquireLease,
  getState,
  isDue,
  markFailure,
  markSuccess
} from "../storage/state";


/*
 * Official results of the foreign (YD) cards. TJK publishes them on the
 * same daily results page as the domestic meetings, under the same
 * SehirId the programme link already carries, and the domestic results
 * parser reads them unchanged. Plain HTTP, no browser rendering.
 */
const KEY = "foreign.results";

export const FOREIGN_RESULTS_CONFIG = {
  ttlMs: 20 * 60_000,
  /* A race's result is looked for this long after its start time. */
  settleMinutes: 15,
  fetchTimeoutMs: 20_000,
  concurrency: 3,
  retentionDays: 400
} as const;


export interface ForeignResultRunner {
  number: number;
  name: string;
  position: number;
}


/* SehirId from the stored programme link (…?SehirId=82&…). */
export function foreignCityId(
  sourceUrl: string
): string | null {
  try {
    const value =
      new URL(sourceUrl).searchParams.get("SehirId");

    return value && /^\d+$/.test(value) ? value : null;
  } catch {
    return null;
  }
}


/*
 * Start of each race as a real instant. TJK prints foreign times in
 * Turkey time, and an American card runs past midnight while keeping
 * the card's date, so a time earlier than the race before it is the
 * next day.
 */
export function foreignRaceStarts(
  raceDate: string,
  races: Array<{ raceNumber: number; time?: string | null }>
): Map<number, Date> {
  const starts = new Map<number, Date>();
  let dayOffset = 0;
  let previous: number | null = null;

  for (const race of [...races].sort((a, b) => a.raceNumber - b.raceNumber)) {
    const base = turkeyDateTime(raceDate, race.time ?? null);

    if (!base) continue;

    if (previous !== null && base.getTime() + dayOffset < previous) {
      dayOffset += 24 * 3_600_000;
    }

    const start = new Date(base.getTime() + dayOffset);
    starts.set(race.raceNumber, start);
    previous = start.getTime();
  }

  return starts;
}


function nameKey(
  value: string
): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .toLocaleUpperCase("en-US")
    .replace(/[^A-Z0-9]/g, "");
}


/*
 * Only races that are final (at least one winner) and whose winner is
 * the horse the programme has under that number. A mismatch means the
 * page was not the card we think it is, so that race is not stored.
 */
export function acceptedForeignResults(
  parsed: OfficialRaceResult[],
  programme: Array<{ raceNumber: number; runners: Array<{ number: number; name: string }> }>
): OfficialRaceResult[] {
  return parsed.filter(race => {
    const card = programme.find(item => item.raceNumber === race.raceNumber);

    if (!card || race.runners.length < 2) return false;

    const winners = race.runners.filter(runner => runner.finishPosition === 1);

    if (!winners.length) return false;

    return winners.every(winner => {
      const listed = card.runners.find(runner => runner.number === winner.horseNumber);

      return !!listed && nameKey(listed.name) === nameKey(winner.horseName);
    });
  });
}


async function storedRaces(
  env: Env,
  fromDate: string
): Promise<Set<string>> {
  const rows =
    await env.DB.prepare(`
      SELECT DISTINCT race_date, city, race_number
      FROM foreign_results
      WHERE race_date >= ?
    `)
      .bind(fromDate)
      .all<any>();

  return new Set(
    (rows.results ?? []).map(
      row => `${row.race_date}|${row.city}|${Number(row.race_number)}`
    )
  );
}


export async function refreshForeignResultsIfDue(
  env: Env,
  force = false,
  now = new Date()
): Promise<{ refreshed: boolean; meetings: number; races: number; failed: string[] }> {
  const idle = { refreshed: false, meetings: 0, races: 0, failed: [] as string[] };
  const state = await getState(env, KEY);

  if (!force && !isDue(state, FOREIGN_RESULTS_CONFIG.ttlMs)) return idle;
  if (!await acquireLease(env, KEY, 180)) return idle;

  try {
    const today = turkeyDate(now);

    const meetings =
      await env.DB.prepare(`
        SELECT race_date, city, program_json, source_url
        FROM foreign_meetings
        WHERE race_date >= date(?, '-1 day')
      `)
        .bind(today)
        .all<any>();

    const stored =
      await storedRaces(env, (meetings.results ?? []).reduce(
        (min: string, row: any) => (row.race_date < min ? row.race_date : min),
        today
      ));

    const settleMs = FOREIGN_RESULTS_CONFIG.settleMinutes * 60_000;

    const due = (meetings.results ?? []).flatMap((row: any) => {
      let races: Array<{ raceNumber: number; time?: string | null; runners: Array<{ number: number; name: string }> }> = [];

      try {
        races = JSON.parse(row.program_json);
      } catch {
        return [];
      }

      const cityId = foreignCityId(row.source_url);

      if (!cityId || !races.length) return [];

      const starts = foreignRaceStarts(row.race_date, races);

      const waiting = races.some(race => {
        const start = starts.get(race.raceNumber);

        return (
          !!start &&
          start.getTime() + settleMs <= now.getTime() &&
          !stored.has(`${row.race_date}|${row.city}|${race.raceNumber}`)
        );
      });

      return waiting
        ? [{ raceDate: String(row.race_date), city: String(row.city), cityId, races }]
        : [];
    });

    const failed: string[] = [];
    const fetchedAt = now.toISOString();
    let storedRacesCount = 0;
    let cursor = 0;

    async function worker(): Promise<void> {
      while (cursor < due.length) {
        const meeting = due[cursor++];

        try {
          const acquired =
            await acquireHttpHtml(
              buildOfficialResultsCityUrl(meeting.raceDate, meeting.city, meeting.cityId),
              { timeoutMs: FOREIGN_RESULTS_CONFIG.fetchTimeoutMs }
            );

          const parsed =
            parseOfficialResultsHtml(acquired.html, meeting.city, meeting.raceDate);

          const accepted =
            acceptedForeignResults(parsed.races, meeting.races);

          const statements = accepted.flatMap(race =>
            race.runners.map(runner =>
              env.DB.prepare(`
                INSERT INTO foreign_results(
                  race_date, city, race_number, horse_number, horse_name,
                  finish_position, fetched_at
                )
                VALUES(?,?,?,?,?,?,?)
                ON CONFLICT(race_date, city, race_number, horse_number) DO UPDATE SET
                  horse_name = excluded.horse_name,
                  finish_position = excluded.finish_position,
                  fetched_at = excluded.fetched_at
              `)
                .bind(
                  meeting.raceDate, meeting.city, race.raceNumber,
                  runner.horseNumber, runner.horseName, runner.finishPosition,
                  fetchedAt
                )
            )
          );

          if (statements.length) await env.DB.batch(statements);
          storedRacesCount += accepted.length;
        } catch {
          failed.push(meeting.city);
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(FOREIGN_RESULTS_CONFIG.concurrency, due.length) },
        () => worker()
      )
    );

    await env.DB.prepare(`
      DELETE FROM foreign_results
      WHERE race_date < date(?, ?)
    `)
      .bind(today, `-${FOREIGN_RESULTS_CONFIG.retentionDays} day`)
      .run();

    await markSuccess(env, KEY);

    return { refreshed: true, meetings: due.length, races: storedRacesCount, failed };
  } catch (error) {
    await markFailure(env, KEY, error instanceof Error ? error.message : String(error));
    throw error;
  }
}


/* Finishing order per city and race for one day, placed horses only. */
export async function getForeignResults(
  env: Env,
  raceDate: string
): Promise<Map<string, Map<number, ForeignResultRunner[]>>> {
  const rows =
    await env.DB.prepare(`
      SELECT city, race_number, horse_number, horse_name, finish_position
      FROM foreign_results
      WHERE race_date = ? AND finish_position > 0
      ORDER BY city, race_number, finish_position, horse_number
    `)
      .bind(raceDate)
      .all<any>();

  const byCity = new Map<string, Map<number, ForeignResultRunner[]>>();

  for (const row of rows.results ?? []) {
    const city = String(row.city);
    const raceNumber = Number(row.race_number);
    const races = byCity.get(city) ?? new Map<number, ForeignResultRunner[]>();
    const runners = races.get(raceNumber) ?? [];

    runners.push({
      number: Number(row.horse_number),
      name: String(row.horse_name),
      position: Number(row.finish_position)
    });

    races.set(raceNumber, runners);
    byCity.set(city, races);
  }

  return byCity;
}
