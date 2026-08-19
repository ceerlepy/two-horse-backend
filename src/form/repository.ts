import type {
  Env
} from "../env";

import type {
  HorseHistoryRun
} from "./types";

export interface FormCandidate {
  horseKey: string;
  horseName: string;
  sourceUrl: string;
}

export async function formCandidates(
  env: Env,
  limit = 12
): Promise<FormCandidate[]> {
  const result =
    await env.DB.prepare(`
      SELECT
        horse_name,
        horse_profile_url
      FROM runners
      WHERE race_date =
        date(
          'now',
          '+3 hours'
        )
        AND horse_profile_url
          IS NOT NULL
        AND horse_profile_url <> ''
      GROUP BY
        horse_name,
        horse_profile_url
      ORDER BY
        horse_name
      LIMIT ?
    `)
      .bind(limit)
      .all<any>();

  const output:
    FormCandidate[] = [];

  for (
    const row of
    result.results ?? []
  ) {
    const match =
      String(
        row.horse_profile_url
      ).match(
        /(?:QueryParameter_AtId|AtId)=(\d+)/
      );

    if (!match) {
      continue;
    }

    output.push({
      horseKey:
        `tjk:${match[1]}`,

      horseName:
        String(
          row.horse_name
        ),

      sourceUrl:
        String(
          row.horse_profile_url
        )
    });
  }

  return output;
}

export async function isFormFresh(
  env: Env,
  horseKey: string,
  ttlMs:
    number
): Promise<boolean> {
  const state =
    await env.DB.prepare(`
      SELECT
        last_success_at
      FROM horse_form_refresh_state
      WHERE horse_key = ?
    `)
      .bind(
        horseKey
      )
      .first<any>();

  if (
    !state?.last_success_at
  ) {
    return false;
  }

  const timestamp =
    Date.parse(
      state.last_success_at
    );

  return (
    Number.isFinite(timestamp) &&
    Date.now() - timestamp <
      ttlMs
  );
}

export async function persistHorseHistory(
  env: Env,
  candidate:
    FormCandidate,
  rows:
    HorseHistoryRun[],
  method:
    string
): Promise<void> {
  const statements:
    D1PreparedStatement[] = [];

  for (
    const row of
    rows.slice(0, 50)
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
          source_url,
          fetched_at
        )
        VALUES(
          ?,?,?,?,?,?,?,?,?,?,?,?,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT(
          horse_key,
          race_date,
          city,
          distance_meters
        )
        DO UPDATE SET
          horse_name =
            excluded.horse_name,
          track =
            excluded.track,
          finish_position =
            excluded.finish_position,
          weight =
            excluded.weight,
          jockey =
            excluded.jockey,
          odds =
            excluded.odds,
          hp =
            excluded.hp,
          source_url =
            excluded.source_url,
          fetched_at =
            CURRENT_TIMESTAMP
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
          candidate.sourceUrl
        )
    );
  }

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
        horse_name =
          excluded.horse_name,
        source_url =
          excluded.source_url,
        status =
          'healthy',
        acquisition_method =
          excluded.acquisition_method,
        last_attempt_at =
          excluded.last_attempt_at,
        last_success_at =
          excluded.last_success_at,
        consecutive_failures =
          0,
        last_error =
          NULL,
        updated_at =
          CURRENT_TIMESTAMP
    `)
      .bind(
        candidate.horseKey,
        candidate.horseName,
        candidate.sourceUrl,
        method,
        new Date()
          .toISOString(),
        new Date()
          .toISOString()
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
      horse_name =
        excluded.horse_name,
      source_url =
        excluded.source_url,
      status =
        'degraded',
      last_attempt_at =
        excluded.last_attempt_at,
      consecutive_failures =
        horse_form_refresh_state
          .consecutive_failures + 1,
      last_error =
        excluded.last_error,
      updated_at =
        CURRENT_TIMESTAMP
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
