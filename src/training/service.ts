import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  parseRaceTraining,
  raceCodeFromPerformanceUrl,
  trainingUrlForRace,
  type RunnerTraining
} from "./parser";


export const TRAINING_CONFIG = {
  /* Gallops are recorded on the days before a race; a few refreshes
   * per day are plenty to pick up a late entry. */
  refreshAfterMinutes: 360,
  retryFailedAfterMinutes: 30,
  batchSize: 6,
  concurrency: 3,
  cronFetchTimeoutMs: 60_000,
  onDemandFetchTimeoutMs: 15_000
} as const;


interface TrainingRace {
  raceDate: string;
  city: string;
  raceNumber: number;
  performanceUrl: string | null;
}


export type TrainingStatus =
  | "ready"
  | "empty"
  | "unavailable";


export interface RaceTrainingResult {
  raceDate: string;
  city: string;
  raceNumber: number;
  status: TrainingStatus;
  fetchedAt: string | null;
  horses: RunnerTraining[];
}


async function fetchRace(
  race: TrainingRace,
  timeoutMs: number
): Promise<RunnerTraining[]> {
  const code = raceCodeFromPerformanceUrl(race.performanceUrl);
  if (!code) throw new Error("NO_RACE_CODE");

  const url = trainingUrlForRace(code);
  const acquired = await acquireHttpHtml(url, { timeoutMs, minimumBytes: 200 });
  return parseRaceTraining(acquired.html, url);
}


async function persist(
  env: Env,
  race: TrainingRace,
  horses: RunnerTraining[]
): Promise<string> {
  const now = new Date().toISOString();

  const statements = [
    env.DB.prepare(`
      DELETE FROM race_training
      WHERE race_date = ? AND city = ? AND race_number = ?
    `).bind(race.raceDate, race.city, race.raceNumber),

    ...horses.map(h =>
      env.DB.prepare(`
        INSERT INTO race_training(
          race_date, city, race_number, horse_number, horse_name,
          training_date, track, track_condition, training_type,
          hippodrome, training_jockey, splits_json,
          detail_url, video_url, fetched_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        race.raceDate, race.city, race.raceNumber, h.horseNumber, h.horseName,
        h.trainingDate, h.track, h.trackCondition, h.trainingType,
        h.hippodrome, h.jockey, JSON.stringify(h.splits),
        h.detailUrl, h.videoUrl, now
      )
    ),

    env.DB.prepare(`
      INSERT INTO race_training_state(
        race_date, city, race_number, status, row_count,
        last_attempt_at, last_success_at, last_error
      )
      VALUES(?,?,?,?,?,?,?,NULL)
      ON CONFLICT(race_date, city, race_number) DO UPDATE SET
        status = excluded.status,
        row_count = excluded.row_count,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        last_error = NULL
    `).bind(
      race.raceDate, race.city, race.raceNumber,
      horses.length ? "healthy" : "empty",
      horses.length, now, now
    )
  ];

  await env.DB.batch(statements);
  return now;
}


async function markFailure(
  env: Env,
  race: TrainingRace,
  error: unknown
): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  await env.DB.prepare(`
    INSERT INTO race_training_state(
      race_date, city, race_number, status, last_attempt_at, last_error
    )
    VALUES(?,?,?,'failed',?,?)
    ON CONFLICT(race_date, city, race_number) DO UPDATE SET
      status = 'failed',
      last_attempt_at = excluded.last_attempt_at,
      last_error = excluded.last_error
  `)
    .bind(race.raceDate, race.city, race.raceNumber, new Date().toISOString(), message)
    .run();
}


export async function refreshRaceTraining(
  env: Env,
  race: TrainingRace,
  timeoutMs: number = TRAINING_CONFIG.cronFetchTimeoutMs
): Promise<{ horses: RunnerTraining[]; fetchedAt: string } | null> {
  try {
    const horses = await fetchRace(race, timeoutMs);
    const fetchedAt = await persist(env, race, horses);
    return { horses, fetchedAt };
  } catch (error) {
    await markFailure(env, race, error);
    return null;
  }
}


export async function trainingRaceCandidates(
  env: Env,
  limit: number = TRAINING_CONFIG.batchSize
): Promise<TrainingRace[]> {
  const rows = await env.DB.prepare(`
    SELECT r.race_date, r.city, r.race_number, r.performance_url
    FROM races r
    LEFT JOIN race_training_state ts
      ON ts.race_date = r.race_date
     AND ts.city = r.city
     AND ts.race_number = r.race_number
    WHERE r.race_date = ?
      AND r.performance_url IS NOT NULL
      AND r.performance_url <> ''
      AND (r.starts_at IS NULL OR datetime(r.starts_at) > datetime('now'))
      AND (
        ts.status IS NULL
        OR (
          ts.status = 'failed'
          AND datetime(ts.last_attempt_at) <= datetime('now', ?)
        )
        OR (
          ts.status IN ('healthy', 'empty')
          AND datetime(ts.last_attempt_at) <= datetime('now', ?)
        )
      )
    ORDER BY ts.status IS NOT NULL, r.starts_at
    LIMIT ?
  `)
    .bind(
      turkeyDate(),
      `-${TRAINING_CONFIG.retryFailedAfterMinutes} minutes`,
      `-${TRAINING_CONFIG.refreshAfterMinutes} minutes`,
      limit
    )
    .all<any>();

  return (rows.results ?? []).map(row => ({
    raceDate: row.race_date,
    city: row.city,
    raceNumber: Number(row.race_number),
    performanceUrl: row.performance_url
  }));
}


export async function refreshTrainingIfDue(
  env: Env
): Promise<{ attempted: number; succeeded: number }> {
  const candidates = await trainingRaceCandidates(env);
  let cursor = 0;
  let succeeded = 0;

  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const race = candidates[cursor++];
      if (await refreshRaceTraining(env, race)) succeeded++;
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(TRAINING_CONFIG.concurrency, candidates.length) },
      () => worker()
    )
  );

  return { attempted: candidates.length, succeeded };
}


function rowToTraining(row: any): RunnerTraining {
  let splits = [];
  try {
    splits = JSON.parse(row.splits_json ?? "[]");
  } catch {
    splits = [];
  }
  return {
    horseNumber: Number(row.horse_number),
    horseName: row.horse_name,
    trainingDate: row.training_date ?? null,
    track: row.track ?? null,
    trackCondition: row.track_condition ?? null,
    trainingType: row.training_type ?? null,
    hippodrome: row.hippodrome ?? null,
    jockey: row.training_jockey ?? null,
    splits,
    detailUrl: row.detail_url ?? null,
    videoUrl: row.video_url ?? null
  };
}


/*
 * Serves stored training rows; when the cron has not reached this race
 * yet, fetches it once inline (TJK answers in well under a second with
 * the browser UA) so the screen is not empty on first open.
 */
export async function getRaceTraining(
  env: Env,
  raceDate: string,
  city: string,
  raceNumber: number
): Promise<RaceTrainingResult> {
  const base = { raceDate, city, raceNumber };

  const state = await env.DB.prepare(`
    SELECT status, last_success_at, last_attempt_at
    FROM race_training_state
    WHERE race_date = ? AND city = ? AND race_number = ?
  `)
    .bind(raceDate, city, raceNumber)
    .first<{ status: string; last_success_at: string | null; last_attempt_at: string | null }>();

  if (state?.last_success_at) {
    const rows = await env.DB.prepare(`
      SELECT *
      FROM race_training
      WHERE race_date = ? AND city = ? AND race_number = ?
      ORDER BY horse_number
    `)
      .bind(raceDate, city, raceNumber)
      .all<any>();

    const horses = (rows.results ?? []).map(rowToTraining);
    return {
      ...base,
      status: horses.length ? "ready" : "empty",
      fetchedAt: state.last_success_at,
      horses
    };
  }

  const recentlyFailed =
    state?.status === "failed" &&
    state.last_attempt_at &&
    Date.now() - Date.parse(state.last_attempt_at) <
      TRAINING_CONFIG.retryFailedAfterMinutes * 60_000;

  if (recentlyFailed) {
    return { ...base, status: "unavailable", fetchedAt: null, horses: [] };
  }

  const race = await env.DB.prepare(`
    SELECT performance_url
    FROM races
    WHERE race_date = ? AND city = ? AND race_number = ?
  `)
    .bind(raceDate, city, raceNumber)
    .first<{ performance_url: string | null }>();

  if (!race?.performance_url) {
    return { ...base, status: "unavailable", fetchedAt: null, horses: [] };
  }

  const fresh = await refreshRaceTraining(
    env,
    { ...base, performanceUrl: race.performance_url },
    TRAINING_CONFIG.onDemandFetchTimeoutMs
  );

  if (!fresh) {
    return { ...base, status: "unavailable", fetchedAt: null, horses: [] };
  }

  return {
    ...base,
    status: fresh.horses.length ? "ready" : "empty",
    fetchedAt: fresh.fetchedAt,
    horses: fresh.horses
  };
}
