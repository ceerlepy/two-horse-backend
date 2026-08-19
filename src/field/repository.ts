import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

export interface FieldRaceCandidate {
  city: string;
  raceNumber: number;
  performanceUrl: string;

  runners:
    Array<{
      horseNumber: number;
      horseName: string;
    }>;
}

export function normalizedHorseName(
  value: string
): string {
  return String(value)
    .normalize("NFKC")
    .toLocaleUpperCase(
      "tr-TR"
    )
    /*
     * TJK programme horse names can carry a trailing
     * parenthesised age, while performance history
     * can expose the bare horse name.
     *
     * CASHOUT (5) -> CASHOUT
     */
    .replace(
      /\s*\(\d+\)\s*$/u,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

export async function fieldRaceCandidates(
  env: Env,
  limit = 6
): Promise<FieldRaceCandidate[]> {
  const date =
    turkeyDate();

  const races =
    await env.DB.prepare(`
      SELECT
        r.city,
        r.race_number,
        r.performance_url
      FROM races r
      LEFT JOIN field_refresh_state fs
        ON fs.race_date =
          r.race_date
       AND fs.city =
          r.city
       AND fs.race_number =
          r.race_number
      WHERE r.race_date = ?
        AND r.performance_url
          IS NOT NULL
        AND r.performance_url <> ''
        AND (
          fs.status IS NULL

          OR fs.status <> 'healthy'

          OR (
            NOT EXISTS (
              SELECT 1
              FROM field_signals sig
              WHERE
                sig.race_date =
                  r.race_date
                AND sig.city =
                  r.city
                AND sig.race_number =
                  r.race_number
                AND sig.tjk_score
                  IS NOT NULL
            )

            AND (
              fs.last_attempt_at IS NULL
              OR datetime(
                fs.last_attempt_at
              ) <= datetime(
                'now',
                '-60 minutes'
              )
            )
          )
        )

      ORDER BY
        r.starts_at
      LIMIT ?
    `)
      .bind(
        date,
        limit
      )
      .all<any>();

  const output:
    FieldRaceCandidate[] = [];

  for (
    const race of
    races.results ?? []
  ) {
    const runners =
      await env.DB.prepare(`
        SELECT
          horse_number,
          horse_name
        FROM runners
        WHERE race_date = ?
          AND city = ?
          AND race_number = ?
        ORDER BY horse_number
      `)
        .bind(
          date,
          race.city,
          race.race_number
        )
        .all<any>();

    output.push({
      city:
        String(race.city),

      raceNumber:
        Number(
          race.race_number
        ),

      performanceUrl:
        String(
          race.performance_url
        ),

      runners:
        (
          runners.results ??
          []
        ).map(
          row => ({
            horseNumber:
              Number(
                row.horse_number
              ),

            horseName:
              String(
                row.horse_name
              )
          })
        )
    });
  }

  return output;
}

export async function persistFieldRace(
  env: Env,
  candidate:
    FieldRaceCandidate,
  scores:
    Array<{
      horseNumber: number;
      score: number | null;
      sampleSize: number;
    }>,
  method: string
): Promise<void> {
  const date =
    turkeyDate();

  const statements:
    D1PreparedStatement[] = [];

  for (
    const item of scores
  ) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO field_signals(
          race_date,
          city,
          race_number,
          horse_number,
          tjk_score,
          sample_size,
          source_url,
          fetched_at
        )
        VALUES(
          ?,?,?,?,?,?,?,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT(
          race_date,
          city,
          race_number,
          horse_number
        )
        DO UPDATE SET
          tjk_score =
            excluded.tjk_score,
          sample_size =
            excluded.sample_size,
          source_url =
            excluded.source_url,
          fetched_at =
            CURRENT_TIMESTAMP
      `)
        .bind(
          date,
          candidate.city,
          candidate.raceNumber,
          item.horseNumber,
          item.score,
          item.sampleSize,
          candidate.performanceUrl
        )
    );
  }

  const usableScoreCount =
    scores.filter(
      item =>
        item.score !== null
    ).length;

  const status =
    usableScoreCount > 0
      ? "healthy"
      : "no-data";

  const now =
    new Date()
      .toISOString();

  statements.push(
    env.DB.prepare(`
      INSERT INTO field_refresh_state(
        race_date,
        city,
        race_number,
        status,
        acquisition_method,
        last_success_at,
        last_attempt_at,
        last_error
      )
      VALUES(
        ?,?,?,?,?,
        ?,
        ?,
        NULL
      )
      ON CONFLICT(
        race_date,
        city,
        race_number
      )
      DO UPDATE SET
        status =
          excluded.status,

        acquisition_method =
          excluded.acquisition_method,

        last_success_at =
          CASE
            WHEN excluded.status = 'healthy'
              THEN excluded.last_success_at
            ELSE
              field_refresh_state.last_success_at
          END,

        last_attempt_at =
          excluded.last_attempt_at,

        last_error =
          NULL
    `)
      .bind(
        date,
        candidate.city,
        candidate.raceNumber,
        status,
        method,
        usableScoreCount > 0
          ? now
          : null,
        now
      )
  );

  for (
    let i = 0;
    i < statements.length;
    i += 75
  ) {
    await env.DB.batch(
      statements.slice(
        i,
        i + 75
      )
    );
  }
}

export async function markFieldRaceFailure(
  env: Env,
  candidate:
    FieldRaceCandidate,
  error: string
): Promise<void> {
  const date =
    turkeyDate();

  await env.DB.prepare(`
    INSERT INTO field_refresh_state(
      race_date,
      city,
      race_number,
      status,
      last_attempt_at,
      last_error
    )
    VALUES(
      ?,?,?,
      'degraded',
      CURRENT_TIMESTAMP,
      ?
    )
    ON CONFLICT(
      race_date,
      city,
      race_number
    )
    DO UPDATE SET
      status =
        'degraded',
      last_attempt_at =
        CURRENT_TIMESTAMP,
      last_error =
        excluded.last_error
  `)
    .bind(
      date,
      candidate.city,
      candidate.raceNumber,
      error.slice(
        0,
        1500
      )
    )
    .run();
}
