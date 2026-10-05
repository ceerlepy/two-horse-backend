import type {
  Env
} from "../env";

import type {
  HorseHistoryRun
} from "./types";

import {
  horseKeyFromProfileUrl
} from "./horse-key";

export interface FormCandidate {
  horseKey: string;
  horseName: string;
  sourceUrl: string;
}

export interface FormCandidateOptions {
  limit: number;
  refreshAfterMinutes: number;
  retryFailedAfterMinutes: number;
  force?: boolean;
}

/*
 * Horses on today's and tomorrow's cards (Turkey time), soonest
 * race first, skipping horses whose history was fetched recently
 * or whose last attempt failed a moment ago. Without the skip the
 * same alphabetical first batch was picked on every run and the
 * rest of the card was never reached.
 */
export async function formCandidates(
  env: Env,
  options: FormCandidateOptions
): Promise<FormCandidate[]> {
  const result =
    await env.DB.prepare(`
      SELECT
        r.horse_name,
        r.horse_profile_url,
        MIN(COALESCE(ra.starts_at, r.race_date)) AS first_start
      FROM runners r
      LEFT JOIN races ra
        ON ra.race_date = r.race_date
        AND ra.city = r.city
        AND ra.race_number = r.race_number
      WHERE r.race_date BETWEEN
          date('now', '+3 hours')
          AND date('now', '+3 hours', '+1 day')
        AND r.horse_profile_url IS NOT NULL
        AND r.horse_profile_url <> ''
      GROUP BY r.horse_profile_url
      ORDER BY first_start
    `)
      .all<any>();

  const states =
    options.force
      ? []
      : (
        await env.DB.prepare(`
          SELECT
            horse_key,
            status,
            last_attempt_at,
            last_success_at
          FROM horse_form_refresh_state
          WHERE updated_at >= datetime('now', '-2 days')
        `)
          .all<any>()
      ).results ?? [];

  const stateByKey =
    new Map(
      states.map(
        (row: any) => [
          String(row.horse_key),
          row
        ]
      )
    );

  const now =
    Date.now();

  const minutesSince = (
    value: unknown
  ): number => {
    const parsed =
      Date.parse(
        String(value ?? "")
      );

    return Number.isFinite(parsed)
      ? (now - parsed) / 60_000
      : Infinity;
  };

  const output:
    FormCandidate[] = [];

  const seen =
    new Set<string>();

  for (
    const row of
    result.results ?? []
  ) {
    const horseKey =
      horseKeyFromProfileUrl(
        String(row.horse_profile_url)
      );

    if (
      !horseKey ||
      seen.has(horseKey)
    ) {
      continue;
    }

    seen.add(horseKey);

    const state =
      stateByKey.get(horseKey);

    if (
      state &&
      minutesSince(state.last_success_at) <
        options.refreshAfterMinutes
    ) {
      continue;
    }

    if (
      state?.status === "degraded" &&
      minutesSince(state.last_attempt_at) <
        options.retryFailedAfterMinutes
    ) {
      continue;
    }

    output.push({
      horseKey,

      horseName:
        String(row.horse_name),

      sourceUrl:
        String(row.horse_profile_url)
    });

    if (
      output.length >=
      options.limit
    ) {
      break;
    }
  }

  return output;
}

export async function persistHorseHistory(
  env: Env,
  candidate:
    FormCandidate,
  rows:
    HorseHistoryRun[],
  method:
    string,
  maxRunsPerHorse:
    number
): Promise<void> {
  const statements:
    D1PreparedStatement[] = [];

  for (
    const row of
    rows.slice(0, maxRunsPerHorse)
  ) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO horse_form_history(
          horse_key,
          horse_name,
          race_date,
          city,
          distance_meters,
          track,
          finish_position,
          weight,
          jockey,
          odds,
          hp,
          finish_time,
          finish_time_seconds,
          start_position,
          race_number,
          race_class,
          trainer,
          prize_tl,
          source_url,
          fetched_at
        )
        VALUES(
          ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT(
          horse_key,
          race_date,
          city,
          distance_meters
        )
        DO UPDATE SET
          horse_name = excluded.horse_name,
          track = excluded.track,
          finish_position = excluded.finish_position,
          weight = excluded.weight,
          jockey = excluded.jockey,
          odds = excluded.odds,
          hp = excluded.hp,
          finish_time = excluded.finish_time,
          finish_time_seconds = excluded.finish_time_seconds,
          start_position = excluded.start_position,
          race_number = excluded.race_number,
          race_class = excluded.race_class,
          trainer = excluded.trainer,
          prize_tl = excluded.prize_tl,
          source_url = excluded.source_url,
          fetched_at = CURRENT_TIMESTAMP
      `)
        .bind(
          candidate.horseKey,
          candidate.horseName,
          row.raceDate,
          row.city,
          row.distanceMeters,
          row.track,
          row.finishPosition,
          row.weight,
          row.jockey,
          row.odds,
          row.hp,
          row.finishTime ?? null,
          row.finishTimeSeconds ?? null,
          row.startPosition ?? null,
          row.raceNumber ?? null,
          row.raceClass ?? null,
          row.trainer ?? null,
          row.prizeTl ?? null,
          candidate.sourceUrl
        )
    );
  }

  /*
   * Bounded table: only the newest maxRunsPerHorse runs per horse
   * are kept, so the table grows with the number of horses, not
   * with time.
   */
  statements.push(
    env.DB.prepare(`
      DELETE FROM horse_form_history
      WHERE horse_key = ?
        AND rowid NOT IN (
          SELECT rowid
          FROM horse_form_history
          WHERE horse_key = ?
          ORDER BY race_date DESC
          LIMIT ?
        )
    `)
      .bind(
        candidate.horseKey,
        candidate.horseKey,
        maxRunsPerHorse
      )
  );

  const now =
    new Date()
      .toISOString();

  statements.push(
    env.DB.prepare(`
      INSERT INTO horse_form_refresh_state(
        horse_key,
        horse_name,
        source_url,
        status,
        acquisition_method,
        last_attempt_at,
        last_success_at,
        consecutive_failures,
        last_error,
        updated_at
      )
      VALUES(
        ?,?,?,
        'healthy',
        ?,
        ?,?,
        0,
        NULL,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(horse_key)
      DO UPDATE SET
        horse_name = excluded.horse_name,
        source_url = excluded.source_url,
        status = 'healthy',
        acquisition_method = excluded.acquisition_method,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        consecutive_failures = 0,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
    `)
      .bind(
        candidate.horseKey,
        candidate.horseName,
        candidate.sourceUrl,
        method,
        now,
        now
      )
  );

  for (
    let index = 0;
    index < statements.length;
    index += 75
  ) {
    await env.DB.batch(
      statements.slice(
        index,
        index + 75
      )
    );
  }
}

export async function markFormFailure(
  env: Env,
  candidate:
    FormCandidate,
  error:
    string
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO horse_form_refresh_state(
      horse_key,
      horse_name,
      source_url,
      status,
      last_attempt_at,
      consecutive_failures,
      last_error,
      updated_at
    )
    VALUES(
      ?,?,?,
      'degraded',
      ?,
      1,
      ?,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(horse_key)
    DO UPDATE SET
      horse_name = excluded.horse_name,
      source_url = excluded.source_url,
      status = 'degraded',
      last_attempt_at = excluded.last_attempt_at,
      consecutive_failures =
        horse_form_refresh_state.consecutive_failures + 1,
      last_error = excluded.last_error,
      updated_at = CURRENT_TIMESTAMP
  `)
    .bind(
      candidate.horseKey,
      candidate.horseName,
      candidate.sourceUrl,
      new Date()
        .toISOString(),
      error.slice(
        0,
        1500
      )
    )
    .run();
}

export interface StoredFormRun extends HorseHistoryRun {
  horseNumber: number;
  horseName: string;
}

/*
 * Last `perHorse` stored runs for every runner of one race,
 * matched through the runner's TJK horse id.
 */
export async function raceFormRuns(
  env: Env,
  raceDate: string,
  city: string,
  raceNumber: number,
  perHorse: number
): Promise<{
  runners: Array<{
    horseNumber: number;
    horseName: string;
    horseKey: string | null;
  }>;
  runs: Map<string, HorseHistoryRun[]>;
}> {
  const runnerRows =
    await env.DB.prepare(`
      SELECT horse_number, horse_name, horse_profile_url
      FROM runners
      WHERE race_date = ? AND city = ? AND race_number = ?
      ORDER BY horse_number
    `)
      .bind(raceDate, city, raceNumber)
      .all<any>();

  const runners =
    (runnerRows.results ?? []).map(
      (row: any) => ({
        horseNumber:
          Number(row.horse_number),

        horseName:
          String(row.horse_name),

        horseKey:
          row.horse_profile_url
            ? horseKeyFromProfileUrl(
              String(row.horse_profile_url)
            )
            : null
      })
    );

  const runs =
    new Map<string, HorseHistoryRun[]>();

  const keys =
    runners
      .map(runner => runner.horseKey)
      .filter(
        (key): key is string =>
          key !== null
      );

  if (!keys.length) {
    return { runners, runs };
  }

  const rows =
    await env.DB.prepare(`
      SELECT *
      FROM (
        SELECT
          h.*,
          ROW_NUMBER() OVER (
            PARTITION BY horse_key
            ORDER BY race_date DESC
          ) AS rn
        FROM horse_form_history h
        WHERE horse_key IN (${keys.map(() => "?").join(",")})
      )
      WHERE rn <= ?
      ORDER BY horse_key, race_date DESC
    `)
      .bind(...keys, perHorse)
      .all<any>();

  for (
    const row of
    rows.results ?? []
  ) {
    const key =
      String(row.horse_key);

    const list =
      runs.get(key) ?? [];

    list.push({
      raceDate: row.race_date,
      city: row.city ?? null,
      distanceMeters: row.distance_meters ?? null,
      track: row.track ?? null,
      finishPosition: row.finish_position ?? null,
      weight: row.weight ?? null,
      jockey: row.jockey ?? null,
      odds: row.odds ?? null,
      hp: row.hp ?? null,
      finishTime: row.finish_time ?? null,
      finishTimeSeconds: row.finish_time_seconds ?? null,
      startPosition: row.start_position ?? null,
      raceNumber: row.race_number ?? null,
      raceClass: row.race_class ?? null,
      trainer: row.trainer ?? null,
      prizeTl: row.prize_tl ?? null
    });

    runs.set(key, list);
  }

  return { runners, runs };
}
