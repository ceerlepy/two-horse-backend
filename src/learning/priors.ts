import type {
  Env
} from "../env";

import {
  distanceBand
} from "./identity";

import {
  expertWeightMultiplier
} from "./adjustment";


interface GroupRow {
  entity_key: string;
  city: string;
  track: string;
  distance_meters: number;

  sample_size: number;
  wins: number;
  top3: number;
  avg_finish: number | null;
}


async function globalRates(
  env: Env
): Promise<{
  winRate: number;
  top3Rate: number;
}> {
  const row =
    await env.DB.prepare(`
      SELECT
        AVG(
          CASE
            WHEN finish_position = 1
              THEN 1.0
            ELSE 0.0
          END
        ) AS win_rate,

        AVG(
          CASE
            WHEN finish_position
              BETWEEN 1 AND 3
              THEN 1.0
            ELSE 0.0
          END
        ) AS top3_rate

      FROM learning_runner_features

      WHERE
        finish_position IS NOT NULL
        AND finish_position >= 0
    `)
      .first<any>();

  return {
    winRate:
      Number(
        row?.win_rate ??
        0
      ),

    top3Rate:
      Number(
        row?.top3_rate ??
        0
      )
  };
}


async function replaceContext(
  env: Env,
  entityType: string,
  rows: GroupRow[]
): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM learning_context_priors
    WHERE entity_type = ?
  `)
    .bind(
      entityType
    )
    .run();

  const now =
    new Date()
      .toISOString();

  const statements:
    D1PreparedStatement[] = [];

  for (
    const row of rows
  ) {
    const sampleSize =
      Number(
        row.sample_size
      );

    const wins =
      Number(
        row.wins
      );

    const top3 =
      Number(
        row.top3
      );

    statements.push(
      env.DB.prepare(`
        INSERT INTO learning_context_priors(
          entity_type,
          entity_key,
          city,
          track,
          distance_band,

          sample_size,
          wins,
          top3,
          win_rate,
          top3_rate,
          avg_finish,
          updated_at
        )
        VALUES(
          ?,?,?,?,?,?,?,?,?,?,?,?
        )
      `)
        .bind(
          entityType,
          row.entity_key,
          row.city,
          row.track,
          distanceBand(
            Number(
              row.distance_meters
            )
          ),

          sampleSize,
          wins,
          top3,

          sampleSize > 0
            ? wins /
              sampleSize
            : 0,

          sampleSize > 0
            ? top3 /
              sampleSize
            : 0,

          row.avg_finish,
          now
        )
    );
  }

  for (
    let index = 0;
    index <
      statements.length;
    index += 60
  ) {
    await env.DB.batch(
      statements.slice(
        index,
        index + 60
      )
    );
  }
}


export async function rebuildLearningPriors(
  env: Env
): Promise<void> {
  const horseRows =
    await env.DB.prepare(`
      SELECT
        COALESCE(
          lrf.horse_id,
          'horse-name:' ||
            UPPER(
              TRIM(
                lrf.horse_name
              )
            )
        ) AS entity_key,

        lr.city,
        COALESCE(
          lr.track,
          'unknown'
        ) AS track,

        COALESCE(
          lr.distance_meters,
          0
        ) AS distance_meters,

        COUNT(*) AS sample_size,

        SUM(
          CASE
            WHEN lrf.finish_position = 1
              THEN 1
            ELSE 0
          END
        ) AS wins,

        SUM(
          CASE
            WHEN lrf.finish_position
              BETWEEN 1 AND 3
              THEN 1
            ELSE 0
          END
        ) AS top3,

        AVG(
          CASE
            WHEN lrf.finish_position > 0
              THEN lrf.finish_position
            ELSE NULL
          END
        ) AS avg_finish

      FROM learning_runner_features lrf

      JOIN learning_races lr
        ON lr.race_date =
          lrf.race_date
       AND lr.city =
          lrf.city
       AND lr.race_number =
          lrf.race_number

      WHERE
        lrf.finish_position
          IS NOT NULL

      GROUP BY
        entity_key,
        lr.city,
        track,
        distance_meters
    `)
      .all<GroupRow>();


  const jockeyRows =
    await env.DB.prepare(`
      SELECT
        lrf.jockey_id
          AS entity_key,

        lr.city,
        COALESCE(
          lr.track,
          'unknown'
        ) AS track,

        COALESCE(
          lr.distance_meters,
          0
        ) AS distance_meters,

        COUNT(*) AS sample_size,

        SUM(
          CASE
            WHEN lrf.finish_position = 1
              THEN 1
            ELSE 0
          END
        ) AS wins,

        SUM(
          CASE
            WHEN lrf.finish_position
              BETWEEN 1 AND 3
              THEN 1
            ELSE 0
          END
        ) AS top3,

        AVG(
          CASE
            WHEN lrf.finish_position > 0
              THEN lrf.finish_position
            ELSE NULL
          END
        ) AS avg_finish

      FROM learning_runner_features lrf

      JOIN learning_races lr
        ON lr.race_date =
          lrf.race_date
       AND lr.city =
          lrf.city
       AND lr.race_number =
          lrf.race_number

      WHERE
        lrf.finish_position
          IS NOT NULL
        AND lrf.jockey_id
          IS NOT NULL

      GROUP BY
        entity_key,
        lr.city,
        track,
        distance_meters
    `)
      .all<GroupRow>();


  const pairRows =
    await env.DB.prepare(`
      SELECT
        (
          COALESCE(
            lrf.horse_id,
            'horse-name:' ||
              UPPER(
                TRIM(
                  lrf.horse_name
                )
              )
          )
          || '|'
          || lrf.jockey_id
        ) AS entity_key,

        lr.city,
        COALESCE(
          lr.track,
          'unknown'
        ) AS track,

        COALESCE(
          lr.distance_meters,
          0
        ) AS distance_meters,

        COUNT(*) AS sample_size,

        SUM(
          CASE
            WHEN lrf.finish_position = 1
              THEN 1
            ELSE 0
          END
        ) AS wins,

        SUM(
          CASE
            WHEN lrf.finish_position
              BETWEEN 1 AND 3
              THEN 1
            ELSE 0
          END
        ) AS top3,

        AVG(
          CASE
            WHEN lrf.finish_position > 0
              THEN lrf.finish_position
            ELSE NULL
          END
        ) AS avg_finish

      FROM learning_runner_features lrf

      JOIN learning_races lr
        ON lr.race_date =
          lrf.race_date
       AND lr.city =
          lrf.city
       AND lr.race_number =
          lrf.race_number

      WHERE
        lrf.finish_position
          IS NOT NULL
        AND lrf.jockey_id
          IS NOT NULL

      GROUP BY
        entity_key,
        lr.city,
        track,
        distance_meters
    `)
      .all<GroupRow>();


  await replaceContext(
    env,
    "horse",
    horseRows.results ?? []
  );

  await replaceContext(
    env,
    "jockey",
    jockeyRows.results ?? []
  );

  await replaceContext(
    env,
    "horse_jockey",
    pairRows.results ?? []
  );


  const global =
    await globalRates(env);

  const expertRows =
    await env.DB.prepare(`
      SELECT
        source_key,

        COUNT(*) AS sample_size,

        SUM(
          CASE
            WHEN finish_position = 1
              THEN 1
            ELSE 0
          END
        ) AS wins,

        SUM(
          CASE
            WHEN finish_position
              BETWEEN 1 AND 3
              THEN 1
            ELSE 0
          END
        ) AS top3

      FROM learning_expert_picks

      WHERE
        finish_position IS NOT NULL
        AND is_positive = 1

      GROUP BY
        source_key
    `)
      .all<any>();

  const now =
    new Date()
      .toISOString();

  await env.DB.prepare(`
    DELETE FROM expert_learning_priors
  `).run();

  for (
    const row of
    expertRows.results ?? []
  ) {
    const sampleSize =
      Number(
        row.sample_size
      );

    const wins =
      Number(
        row.wins
      );

    const top3 =
      Number(
        row.top3
      );

    const winRate =
      sampleSize > 0
        ? wins /
          sampleSize
        : 0;

    const top3Rate =
      sampleSize > 0
        ? top3 /
          sampleSize
        : 0;

    const multiplier =
      expertWeightMultiplier(
        {
          sampleSize,
          winRate,
          top3Rate
        },
        global
      );

    await env.DB.prepare(`
      INSERT INTO expert_learning_priors(
        source_key,
        sample_size,
        winner_hit_rate,
        top3_hit_rate,
        positive_pick_count,
        multiplier,
        updated_at
      )
      VALUES(
        ?,?,?,?,?,?,?
      )
    `)
      .bind(
        row.source_key,
        sampleSize,
        winRate,
        top3Rate,
        sampleSize,
        multiplier,
        now
      )
      .run();
  }
}
