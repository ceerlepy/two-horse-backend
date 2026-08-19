import type {
  Env
} from "../env";


export interface LearningRunnerSnapshot {
  raceDate: string;
  city: string;
  raceNumber: number;
  horseNumber: number;

  horseName: string;
  horseId: string | null;

  jockey: string | null;
  jockeyId: string | null;
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

  /*
   * Score provenance:
   * base -> learning adjustment -> final modelScore.
   */
  baseModelScore: number | null;
  learningAdjustment: number | null;

  /*
   * Full scale=1 learned prediction used only
   * for leakage-safe shadow evaluation.
   */
  shadowModelScore: number | null;

  /*
   * Production-served score after safety gate.
   */
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

    modelVersion: string;
    learningPolicyVersion: string;
    couponPolicyVersion: string;

    couponMode: string | null;
    couponHorseNumbers: number[];
    couponConfidence: number | null;
    couponExpansionPressure: number | null;
    couponReason: string | null;

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

      model_version,
      learning_policy_version,
      coupon_policy_version,

      coupon_mode,
      coupon_horse_numbers_json,
      coupon_confidence,
      coupon_expansion_pressure,
      coupon_reason,

      snapshot_at
    )
    VALUES(
      ?,?,?,?,?,?,
      ?,?,?,
      ?,?,?,?,?,
      ?
    )

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

      input.modelVersion,
      input.learningPolicyVersion,
      input.couponPolicyVersion,

      input.couponMode,
      JSON.stringify(
        input.couponHorseNumbers
      ),
      input.couponConfidence,
      input.couponExpansionPressure,
      input.couponReason,

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
      horse_id,

      jockey,
      jockey_id,
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

      base_model_score,
      learning_adjustment,
      shadow_model_score,
      model_score,
      model_confidence,

      snapshot_at
    )
    VALUES(
      ?,?,?,?,
      ?,?,
      ?,?,?,
      ?,
      ?,
      ?,?,
      ?,
      ?,?,?,?,?,?,
      ?,?,?,?,?,?,
      ?,
      ?,?,?,?,?,
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
      row.horseId,

      row.jockey,
      row.jockeyId,
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

      row.baseModelScore,
      row.learningAdjustment,
      row.shadowModelScore,
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
      ),

    env.DB.prepare(`
      UPDATE learning_expert_picks

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
      )
  ]);
}


export async function insertLearningExpertPick(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    raceNumber: number;
    horseNumber: number;

    horseId: string | null;
    horseName: string;

    sourceKey: string;
    confidence: number | null;

    isBanko: boolean;
    isFavorite: boolean;
    isStrong: boolean;
    isStar: boolean;
    isRival: boolean;
    isSurprise: boolean;
    isAvoid: boolean;

    snapshotAt: string;
  }
): Promise<void> {
  const positive =
    input.isBanko ||
    input.isFavorite ||
    input.isStrong ||
    input.isStar ||
    input.isRival ||
    input.isSurprise;

  await env.DB.prepare(`
    INSERT INTO learning_expert_picks(
      race_date,
      city,
      race_number,
      horse_number,

      horse_id,
      horse_name,

      source_key,
      confidence,

      is_banko,
      is_favorite,
      is_strong,
      is_star,
      is_rival,
      is_surprise,
      is_avoid,
      is_positive,

      snapshot_at
    )
    VALUES(
      ?,?,?,?,
      ?,?,
      ?,?,
      ?,?,?,?,?,?,?,?,
      ?
    )

    ON CONFLICT(
      race_date,
      city,
      race_number,
      horse_number,
      source_key
    )
    DO NOTHING
  `)
    .bind(
      input.raceDate,
      input.city,
      input.raceNumber,
      input.horseNumber,

      input.horseId,
      input.horseName,

      input.sourceKey,
      input.confidence,

      input.isBanko ? 1 : 0,
      input.isFavorite ? 1 : 0,
      input.isStrong ? 1 : 0,
      input.isStar ? 1 : 0,
      input.isRival ? 1 : 0,
      input.isSurprise ? 1 : 0,
      input.isAvoid ? 1 : 0,
      positive ? 1 : 0,

      input.snapshotAt
    )
    .run();
}
