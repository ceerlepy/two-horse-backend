import type { Env } from "../env";
import { acquireHttpHtml } from "../acquisition/http";
import { errorMessage, turkeyDate } from "../shared";
import { parseArchiveIndex, parseArchiveMeeting } from "./archive-parser";
import { deriveMeeting } from "./derive";
import { addDays, tjkQueryDate } from "./cities";

/*
 * Archives TJK's daily result pages for domestic meetings. Today's value
 * model only needs history up to yesterday, so each tick first makes sure
 * the most recent dates are in, then walks backwards to backfillStart a
 * few dates at a time. The full backfill (~825 dates) takes about a day of
 * ticks and is then idle apart from one new date per day.
 *
 * `revision` bumps when the parser starts storing a new field (2: start
 * position). Dates archived by an older revision stay "done" (coverage is
 * unaffected) and are re-fetched, newest first, with whatever tick
 * capacity is left after new dates.
 */
export const ARCHIVE_CONFIG = {
  backfillStart: "2024-07-01",
  datesPerTick: 4,
  maxAttempts: 6,
  retryAfterMinutes: 60,
  fetchTimeoutMs: 30_000,
  retentionDays: 800,
  revision: 2
} as const;

const INDEX_URL = "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisSonuclari?QueryParameter_Tarih=";

export async function archiveDate(env: Env, raceDate: string): Promise<number> {
  const index = await acquireHttpHtml(INDEX_URL + tjkQueryDate(raceDate), {
    timeoutMs: ARCHIVE_CONFIG.fetchTimeoutMs, minimumBytes: 1000
  });
  const links = parseArchiveIndex(index.html);
  const now = new Date().toISOString();

  for (const link of links) {
    const page = await acquireHttpHtml(link.url, { timeoutMs: ARCHIVE_CONFIG.fetchTimeoutMs, minimumBytes: 1000 });
    const meeting = deriveMeeting(link.cityId, parseArchiveMeeting(page.html));
    const raceDateOf = new Map(meeting.races.map(r => [r.raceCode, raceDate]));
    const statements: D1PreparedStatement[] = [];

    for (const r of meeting.races) {
      statements.push(env.DB.prepare(`
        INSERT OR REPLACE INTO result_archive_races(
          race_code, race_date, city_id, race_number, distance_meters, surface,
          breed, going, class_text, prize1, market_ok, fetched_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(r.raceCode, raceDate, link.cityId, r.raceNumber, r.distanceMeters, r.surface,
        r.breed, r.going, r.classText, r.prize1, r.marketOk ? 1 : 0, now));
    }
    for (const u of meeting.runners) {
      statements.push(env.DB.prepare(`
        INSERT OR REPLACE INTO result_archive_runners(
          race_code, race_date, horse_id, horse_number, finish_position, time_sec, ganyan,
          agf_percent, p_win, jockey_id, trainer_id, weight, hp, fig, start_position
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(u.raceCode, raceDateOf.get(u.raceCode) ?? raceDate, u.horseId, u.horseNumber,
        u.finishPosition, u.timeSec, u.ganyan, u.agfPercent, u.pWin, u.jockeyId, u.trainerId,
        u.weight, u.hp, u.fig, u.startPosition));
    }
    for (let i = 0; i < statements.length; i += 80) {
      await env.DB.batch(statements.slice(i, i + 80));
    }
  }
  return links.length;
}

/* Dates still to archive, newest first: yesterday back to backfillStart. */
function turkeyHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hour12: false }).format(now));
}

export async function pendingArchiveDates(
  env: Env, limit: number, today = turkeyDate(), hour = turkeyHour()
): Promise<string[]> {
  const rows = await env.DB.prepare(`
    SELECT race_date, status, attempts, updated_at, revision FROM result_archive_dates
  `).all<any>();
  const known = new Map((rows.results ?? []).map((r: any) => [String(r.race_date), r]));
  const retryBefore = Date.now() - ARCHIVE_CONFIG.retryAfterMinutes * 60_000;

  const out: string[] = [];
  /* Yesterday's late meetings are only certainly final by the morning. */
  const newest = addDays(today, hour >= 6 ? -1 : -2);
  for (let d = newest; d >= ARCHIVE_CONFIG.backfillStart && out.length < limit; d = addDays(d, -1)) {
    const row: any = known.get(d);
    if (!row) { out.push(d); continue; }
    if (row.status === "done") continue;
    if (Number(row.attempts) >= ARCHIVE_CONFIG.maxAttempts) continue;
    if (Date.parse(row.updated_at) <= retryBefore) out.push(d);
  }
  const stale = [...known.values()]
    .filter((r: any) => r.status === "done" && Number(r.revision ?? 1) < ARCHIVE_CONFIG.revision &&
      Date.parse(r.updated_at) <= retryBefore)
    .map((r: any) => String(r.race_date))
    .sort((a, b) => b.localeCompare(a));
  for (const d of stale) {
    if (out.length >= limit) break;
    out.push(d);
  }
  return out;
}

export async function refreshResultArchive(env: Env): Promise<{ archived: string[]; failed: string[] }> {
  const archived: string[] = [];
  const failed: string[] = [];
  for (const raceDate of await pendingArchiveDates(env, ARCHIVE_CONFIG.datesPerTick)) {
    const now = new Date().toISOString();
    try {
      const meetings = await archiveDate(env, raceDate);
      await env.DB.prepare(`
        INSERT INTO result_archive_dates(race_date, status, meetings, attempts, last_error, updated_at, revision)
        VALUES(?, 'done', ?, 1, NULL, ?, ?)
        ON CONFLICT(race_date) DO UPDATE SET status='done', meetings=excluded.meetings,
          attempts=result_archive_dates.attempts+1, last_error=NULL, updated_at=excluded.updated_at,
          revision=excluded.revision
      `).bind(raceDate, meetings, now, ARCHIVE_CONFIG.revision).run();
      archived.push(raceDate);
    } catch (error) {
      await env.DB.prepare(`
        INSERT INTO result_archive_dates(race_date, status, meetings, attempts, last_error, updated_at)
        VALUES(?, 'failed', 0, 1, ?, ?)
        ON CONFLICT(race_date) DO UPDATE SET
          -- a failed re-fetch keeps an already archived date usable
          status=CASE WHEN result_archive_dates.status='done' THEN 'done' ELSE 'failed' END,
          attempts=CASE WHEN result_archive_dates.status='done' THEN result_archive_dates.attempts
            ELSE result_archive_dates.attempts+1 END,
          last_error=excluded.last_error, updated_at=excluded.updated_at
      `).bind(raceDate, errorMessage(error).slice(0, 300), now).run();
      failed.push(raceDate);
    }
  }
  return { archived, failed };
}

/* Oldest date from which the archive is complete up to yesterday. */
export async function archiveCoverage(env: Env, today = turkeyDate()): Promise<{ completeFrom: string | null; doneDates: number }> {
  const rows = await env.DB.prepare(`
    SELECT race_date FROM result_archive_dates WHERE status='done' ORDER BY race_date DESC
  `).all<any>();
  const done = new Set((rows.results ?? []).map((r: any) => String(r.race_date)));
  let d = addDays(today, -1);
  if (!done.has(d)) d = addDays(d, -1);   // yesterday is only archived after 06:00
  let completeFrom: string | null = null;
  while (done.has(d)) { completeFrom = d; d = addDays(d, -1); }
  return { completeFrom, doneDates: done.size };
}
