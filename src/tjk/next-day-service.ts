import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";

import {
  errorMessage,
  isoNow,
  turkeyDate
} from "../shared";

import {
  acquireLease,
  getState,
  isDue,
  markDeferred,
  markFailure,
  markSuccess
} from "../storage/state";

import {
  extractTjkProgramForDate
} from "./extraction-pipeline";

import {
  isForeignTjkMeeting
} from "./meeting-classification";

/*
 * Tomorrow's TJK program (D+1), for display only.
 *
 * Once today's last race has started the app has nothing to show
 * until TJK's morning AGF; TJK publishes tomorrow's card (cities,
 * races, runners, jockey, weight, HP, form, start position) during
 * the afternoon/evening of D. This service stores that card as one
 * compact JSON document in next_day_programs.
 *
 * Invariants:
 * - it never writes meetings/races/runners (those stay today's
 *   canonical program, which scoring, coupons and learning read);
 * - it never records AGF snapshots (D+1 has no AGF yet);
 * - it uses HTTP only, no Browser Rendering / Workers AI fallback.
 */

const KEY = "tjk:next-day-program";

export const NEXT_DAY_CONFIG = {
  /* Turkey-local hour from which tomorrow's card is worth asking for. */
  windowStartHour: 12,
  ttlMs: 3 * 3_600_000,
  /* TJK has not published the card yet: ask again after this. */
  notPublishedRetryMinutes: 60,
  leaseSeconds: 180,
  /* A race counts as started this long after its start time. */
  startedGraceMs: 60_000
} as const;

export interface NextDayRunner {
  horse_number: number;
  horse_name: string;
  jockey: string | null;
  weight: number | null;
  hp: number | null;
  recent_form_raw: string | null;
  start_position: number | null;
  /*
   * Early expert picks (src/experts/next-day-service.ts): distinct
   * sources with a positive pick, plus our own counts-only sentence.
   * Attached at read time, never stored here; absent for free tier.
   */
  expertPickCount?: number;
  expertSummary?: string;
}

export interface NextDayRace {
  race_number: number;
  start_time: string | null;
  starts_at: string | null;
  distance_meters: number | null;
  track: string | null;
  /*
   * Altılı sequence numbers that start at this race (TJK's own
   * "N. Altılı Ganyan" marker), so an expert's altılı-leg picks
   * ("1. ayak") map to the right race. Absent on cards stored
   * before this field existed.
   */
  sixfold_start_numbers?: number[];
  runners: NextDayRunner[];
}

export interface NextDayProgram {
  date: string;
  meetings: Array<{
    city: string;
    races: NextDayRace[];
  }>;
}

export function addDays(
  isoDate: string,
  days: number
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days))
    .toISOString()
    .slice(0, 10);
}

function turkeyHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(now)
  );
}

/* Same starts_at format as today's races (UTC ISO; Turkey is UTC+3). */
function startsAtIso(
  date: string,
  time: string | null
): string | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm)).toISOString();
}

/* Compact, display-only projection: no profile URLs, no AGF. */
export function toNextDayProgram(
  program: TjkProgramInput,
  date: string
): NextDayProgram {
  return {
    date,
    meetings: program.meetings.map(meeting => ({
      city: meeting.city.trim(),
      races: meeting.races.map(race => ({
        race_number: race.raceNumber,
        start_time: race.time ?? null,
        starts_at: startsAtIso(date, race.time),
        distance_meters: race.distanceMeters ?? null,
        track: race.track ?? null,
        sixfold_start_numbers: (race.sixfoldStartNumbers ?? [])
          .filter(value => Number.isInteger(value) && value > 0),
        runners: race.runners.map(runner => ({
          horse_number: runner.number,
          horse_name: runner.name,
          jockey: runner.jockey ?? null,
          weight: runner.weight ?? null,
          hp: runner.hp ?? null,
          recent_form_raw: runner.recentFormRaw ?? null,
          start_position: runner.startPosition ?? null
        }))
      }))
    }))
  };
}

export interface NextDayRefreshOptions {
  now?: Date;
  extract?: typeof extractTjkProgramForDate;
}

export async function refreshNextDayProgramIfDue(
  env: Env,
  options: NextDayRefreshOptions = {}
): Promise<{ refreshed: boolean; reason: string; date?: string }> {
  const now = options.now ?? new Date();
  const extract = options.extract ?? extractTjkProgramForDate;
  const today = turkeyDate(now);
  const target = addDays(today, 1);

  await env.DB.prepare(
    "DELETE FROM next_day_programs WHERE race_date < ?"
  ).bind(today).run();

  if (turkeyHour(now) < NEXT_DAY_CONFIG.windowStartHour) {
    return { refreshed: false, reason: "before-window", date: target };
  }

  const state = await getState(env, KEY);
  const stored = await env.DB.prepare(
    "SELECT fetched_at FROM next_day_programs WHERE race_date=?"
  ).bind(target).first<{ fetched_at: string }>();

  /*
   * A success for an earlier target date (yesterday's run) must not
   * keep today's target waiting out the TTL.
   */
  const effectiveState =
    stored ? state : state && { ...state, last_success_at: null };

  if (!isDue(effectiveState, NEXT_DAY_CONFIG.ttlMs)) {
    return { refreshed: false, reason: "fresh", date: target };
  }

  if (!await acquireLease(env, KEY, NEXT_DAY_CONFIG.leaseSeconds)) {
    return { refreshed: false, reason: "already-refreshing", date: target };
  }

  try {
    const { program } = await extract(env, target);

    if (!program) {
      await markDeferred(env, KEY, NEXT_DAY_CONFIG.notPublishedRetryMinutes);
      return { refreshed: false, reason: "not-published", date: target };
    }

    const document = toNextDayProgram(program, target);

    await env.DB.prepare(`
      INSERT INTO next_day_programs(race_date, program_json, fetched_at)
      VALUES (?, ?, ?)
      ON CONFLICT(race_date) DO UPDATE SET
        program_json=excluded.program_json,
        fetched_at=excluded.fetched_at
    `).bind(target, JSON.stringify(document), isoNow()).run();

    await markSuccess(env, KEY);
    return { refreshed: true, reason: "stored", date: target };
  } catch (error) {
    await markFailure(env, KEY, errorMessage(error));
    throw error;
  }
}

export async function loadNextDayProgram(
  env: Env,
  date: string
): Promise<NextDayProgram | null> {
  const row = await env.DB.prepare(
    "SELECT program_json FROM next_day_programs WHERE race_date=?"
  ).bind(date).first<{ program_json: string }>();

  if (!row) return null;

  try {
    const parsed = JSON.parse(row.program_json) as NextDayProgram;
    /* Cards stored before the foreign filter may still carry YD meetings. */
    const meetings =
      (parsed?.meetings ?? []).filter(
        meeting => !isForeignTjkMeeting(meeting.city)
      );
    return meetings.length ? { ...parsed, meetings } : null;
  } catch {
    return null;
  }
}

/*
 * Today is "over" when it has no meetings at all, or every race
 * with a known start time started more than a minute ago.
 */
export function isTodayOver(
  meetings: any[],
  now: Date = new Date()
): boolean {
  const cutoff = now.getTime() - NEXT_DAY_CONFIG.startedGraceMs;

  for (const meeting of meetings ?? []) {
    for (const race of meeting?.races ?? []) {
      const startsAt = Date.parse(race?.starts_at ?? "");
      if (!Number.isFinite(startsAt) || startsAt > cutoff) return false;
    }
  }

  return true;
}

/*
 * The `nextDay` field of /api/today: present only when today is
 * over and tomorrow's card has been stored.
 */
export async function nextDayForToday(
  env: Env,
  todayMeetings: any[],
  now: Date = new Date()
): Promise<NextDayProgram | null> {
  if (!isTodayOver(todayMeetings, now)) return null;
  return loadNextDayProgram(env, addDays(turkeyDate(now), 1));
}
