import type {
  Env
} from "../env";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  discoverCityResultUrl
} from "./acquisition";

import {
  parseOfficialResultsHtml
} from "./parser";

import type {
  OfficialMeetingResults
} from "./types";

/*
 * Live winners for "Kuponlarım".
 *
 * The official ingest (runtime.ts) waits until 45 minutes after a
 * meeting's LAST race, so a coupon's first legs stayed "waiting"
 * for hours. While a meeting runs, this step reads TJK's city result
 * page over plain HTTP once a race has had time to finish and stores
 * only the winners. No browser, no AI fallback: if the page can't be
 * read, the official ingest still settles everything later.
 * Learning labels are never written here.
 */
export const LIVE_WINNER_CONFIG = {
  /* A race's result is usually posted within ~10 minutes. */
  settleMinutes: 8,
  /* Each meeting's page is read at most this often. */
  retryMinutes: 8,
  maxMeetingsPerRun: 3,
  retentionDays: 3
} as const;

interface DueMeeting {
  race_date: string;
  city: string;
}

function isoMinutesAgo(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

/* Winner of every race the page shows with finish positions. */
export function winnersFromResults(
  results: OfficialMeetingResults
): Map<number, number> {
  const winners = new Map<number, number>();

  for (const race of results.races) {
    const first = race.runners.filter(runner => runner.finishPosition === 1);

    /* A dead heat or a malformed row is left to the official ingest. */
    if (first.length === 1) {
      winners.set(race.raceNumber, first[0].horseNumber);
    }
  }

  return winners;
}

/*
 * Meetings with a race that started at least settleMinutes ago and
 * has neither an official label nor a live winner yet.
 */
async function dueMeetings(env: Env, now: Date): Promise<DueMeeting[]> {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const rows = await env.DB.prepare(`
    SELECT lr.race_date, lr.city
    FROM learning_races lr
    WHERE lr.race_date IN (?, ?)
      AND lr.labelled_at IS NULL
      AND lr.starts_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM live_race_winners w
        WHERE w.race_date = lr.race_date
          AND w.city = lr.city
          AND w.race_number = lr.race_number
      )
      AND NOT EXISTS (
        SELECT 1 FROM live_winner_runs r
        WHERE r.race_date = lr.race_date
          AND r.city = lr.city
          AND r.last_attempt_at > ?
      )
    GROUP BY lr.race_date, lr.city
    ORDER BY lr.race_date DESC, lr.city
    LIMIT ?
  `)
    .bind(
      today,
      yesterday,
      isoMinutesAgo(now, LIVE_WINNER_CONFIG.settleMinutes),
      isoMinutesAgo(now, LIVE_WINNER_CONFIG.retryMinutes),
      LIVE_WINNER_CONFIG.maxMeetingsPerRun
    )
    .all<DueMeeting>();

  return rows.results ?? [];
}

export async function refreshLiveWinners(
  env: Env,
  now = new Date()
): Promise<{ meetings: number; winners: number }> {
  const due = await dueMeetings(env, now);
  let meetings = 0;
  let winners = 0;

  for (const meeting of due) {
    await env.DB.prepare(`
      INSERT INTO live_winner_runs (race_date, city, last_attempt_at)
      VALUES (?, ?, ?)
      ON CONFLICT(race_date, city) DO UPDATE SET last_attempt_at = excluded.last_attempt_at
    `)
      .bind(meeting.race_date, meeting.city, now.toISOString())
      .run();

    try {
      const { cityUrl } = await discoverCityResultUrl({
        raceDate: meeting.race_date,
        city: meeting.city
      });

      const page = await acquireHttpHtml(cityUrl);
      const found = winnersFromResults(
        parseOfficialResultsHtml(page.html, meeting.city, meeting.race_date)
      );

      if (found.size) {
        await env.DB.batch(
          [...found].map(([raceNumber, horseNumber]) =>
            env.DB.prepare(`
              INSERT INTO live_race_winners (race_date, city, race_number, horse_number, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(race_date, city, race_number) DO UPDATE SET
                horse_number = excluded.horse_number,
                updated_at = excluded.updated_at
            `).bind(meeting.race_date, meeting.city, raceNumber, horseNumber, now.toISOString())
          )
        );
      }

      meetings += 1;
      winners += found.size;
    } catch (error) {
      /* Not posted yet or page changed: the official ingest settles it later. */
      console.warn("[LIVE_WINNERS] pending", meeting.race_date, meeting.city, String(error));
    }
  }

  const cutoff = new Date(now.getTime() - LIVE_WINNER_CONFIG.retentionDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM live_race_winners WHERE race_date < ?`).bind(cutoff),
    env.DB.prepare(`DELETE FROM live_winner_runs WHERE race_date < ?`).bind(cutoff)
  ]);

  return { meetings, winners };
}
