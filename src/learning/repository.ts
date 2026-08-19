import type {
  Env
} from "../env";


export interface LearningRunnerSnapshot {
  raceDate: string;
  city: string;
  raceNumber: number;
  horseNumber: number;

  horseName: string;

  jockey: string | null;
  weight: number | null;
  hp: number | null;

  finalAgf: number | null;

  recentFormRaw: string | null;
  formScore: number | null;

  marketScore: number | null;

  agfT90: number | null;
  agfT30: number | null;
  agfT5: number | null;
  agfFinal: number | null;
  agfMaxRise: number | null;
  agfMaxFall: number | null;

  expertScore: number | null;
  expertSourceCount: number;

  expertBankoCount: number;
  expertFavoriteCount: number;
  expertRivalCount: number;
  expertSurpriseCount: number;

  fieldScore: number | null;

  modelScore: number | null;
  modelConfidence: number | null;

  snapshotAt: string;
}


export async function insertLearningRace(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    raceNumber: number;
    startsAt: string | null;
    distanceMeters: number | null;
    track: string | null;
    snapshotAt: string;
  }
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO learning_races(
      race_date,
      city,
      race_number,
      starts_at,
      distance_meters,
      track,
      snapshot_at
    )
    VALUES(?,?,?,?,?,?,?)

    ON CONFLICT(
      race_date,
      city,
      race_number
    )
    DO NOTHING
  `)
    .bind(
      input.raceDate,
      input.city,
      input.raceNumber,
      input.startsAt,
      input.distanceMeters,
      input.track,
      input.snapshotAt
    )
    .run();
}


/*
 * IMMUTABILITY RULE
 *
 * Once a pre-race runner feature row exists,
 * later refreshes MUST NOT overwrite it.
 *
 * This prevents post-race information leaking
 * backwards into training features.
 */
export async function insertLearningRunner(
  env: Env,
  row: LearningRunnerSnapshot
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO learning_runner_features(
      race_date,
      city,
      race_number,
      horse_number,

      horse_name,

      jockey,
      weight,
      hp,

      final_agf,

      recent_form_raw,
      form_score,

      market_score,

      agf_t90,
      agf_t30,
      agf_t5,
      agf_final,
      agf_max_rise,
      agf_max_fall,

      expert_score,
      expert_source_count,
      expert_banko_count,
      expert_favorite_count,
      expert_rival_count,
      expert_surprise_count,

      field_score,

      model_score,
      model_confidence,

      snapshot_at
    )
    VALUES(
      ?,?,?,?,
      ?,
      ?,?,?,
      ?,
      ?,?,
      ?,
      ?,?,?,?,?,?,
      ?,?,?,?,?,?,
      ?,
      ?,?,
      ?
    )

    ON CONFLICT(
      race_date,
      city,
      race_number,
      horse_number
    )
    DO NOTHING
  `)
    .bind(
      row.raceDate,
      row.city,
      row.raceNumber,
      row.horseNumber,

      row.horseName,

      row.jockey,
      row.weight,
      row.hp,

      row.finalAgf,

      row.recentFormRaw,
      row.formScore,

      row.marketScore,

      row.agfT90,
      row.agfT30,
      row.agfT5,
      row.agfFinal,
      row.agfMaxRise,
      row.agfMaxFall,

      row.expertScore,
      row.expertSourceCount,
      row.expertBankoCount,
      row.expertFavoriteCount,
      row.expertRivalCount,
      row.expertSurpriseCount,

      row.fieldScore,

      row.modelScore,
      row.modelConfidence,

      row.snapshotAt
    )
    .run();
}


/*
 * Labels are written separately from features.
 *
 * This is intentionally the ONLY mutation allowed
 * after a prediction snapshot has been frozen.
 */
export async function attachOfficialResult(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    raceNumber: number;
    horseNumber: number;
    finishPosition: number;
    labelledAt: string;
  }
): Promise<void> {
  if (
    !Number.isInteger(
      input.finishPosition
    ) ||
    input.finishPosition < 0
  ) {
    throw new Error(
      "INVALID_OFFICIAL_FINISH_POSITION"
    );
  }

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE learning_runner_features

      SET
        finish_position = ?,
        labelled_at = ?

      WHERE
        race_date = ?
        AND city = ?
        AND race_number = ?
        AND horse_number = ?
        AND finish_position IS NULL
    `)
      .bind(
        input.finishPosition,
        input.labelledAt,
        input.raceDate,
        input.city,
        input.raceNumber,
        input.horseNumber
      ),

    env.DB.prepare(`
      UPDATE learning_races

      SET labelled_at =
        COALESCE(
          labelled_at,
          ?
        )

      WHERE
        race_date = ?
        AND city = ?
        AND race_number = ?
    `)
      .bind(
        input.labelledAt,
        input.raceDate,
        input.city,
        input.raceNumber
      )
  ]);
}
