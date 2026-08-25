import type {
  Env
} from "../env";

import type {
  ExpertPickInput
} from "../types/models";

import {
  turkeyDate
} from "../shared";


function upsertStatement(
  env:
    Env,

  raceDate:
    string,

  sourceKey:
    string,

  contentHash:
    string,

  pick:
    ExpertPickInput
): D1PreparedStatement {
  return env.DB.prepare(`
    INSERT INTO expert_predictions(
      race_date,
      city,
      race_number,
      horse_number,
      source_key,
      horse_name,
      comment,
      is_favorite,
      is_banko,
      is_strong,
      is_star,
      is_rival,
      is_surprise,
      is_avoid,
      source_rank,
      confidence,
      content_hash,
      updated_at
    )
    VALUES(
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP
    )

    ON CONFLICT(
      race_date,
      city,
      race_number,
      horse_number,
      source_key
    )
    DO UPDATE SET
      horse_name = excluded.horse_name,
      comment = excluded.comment,
      is_favorite = excluded.is_favorite,
      is_banko = excluded.is_banko,
      is_strong = excluded.is_strong,
      is_star = excluded.is_star,
      is_rival = excluded.is_rival,
      is_surprise = excluded.is_surprise,
      is_avoid = excluded.is_avoid,
      source_rank = excluded.source_rank,
      confidence = excluded.confidence,
      content_hash = excluded.content_hash,
      updated_at = CURRENT_TIMESTAMP
  `)
    .bind(
      raceDate,
      pick.city,
      pick.raceNumber,
      pick.horseNumber,
      sourceKey,
      pick.horseName,
      pick.comment,
      pick.isFavorite ? 1 : 0,
      pick.isBanko ? 1 : 0,
      pick.isStrong ? 1 : 0,
      pick.isStar ? 1 : 0,
      pick.isRival ? 1 : 0,
      pick.isSurprise ? 1 : 0,
      pick.isAvoid ? 1 : 0,
      pick.sourceRank,
      pick.confidence,
      contentHash
    );
}


export async function persistExpertPicks(
  env:
    Env,

  sourceKey:
    string,

  contentHash:
    string,

  picks:
    ExpertPickInput[]
): Promise<void> {
  for (const pick of picks) {
    await upsertStatement(
      env,
      turkeyDate(),
      sourceKey,
      contentHash,
      pick
    )
      .run();
  }
}


export async function replaceExpertPicksForDate(
  env:
    Env,

  raceDate:
    string,

  sourceKey:
    string,

  contentHash:
    string,

  picks:
    ExpertPickInput[]
): Promise<void> {
  if (!picks.length) {
    throw new Error(
      "REFUSING_EMPTY_EXPERT_BUNDLE"
    );
  }


  /*
   * D1 batch = one fail-closed transactional boundary.
   *
   * Old source/day rows are removed only in the same batch
   * that writes the complete validated replacement.
   */
  const statements:
    D1PreparedStatement[] = [
      env.DB.prepare(`
        DELETE FROM expert_predictions
        WHERE race_date = ?
          AND source_key = ?
      `)
        .bind(
          raceDate,
          sourceKey
        )
    ];


  for (const pick of picks) {
    statements.push(
      upsertStatement(
        env,
        raceDate,
        sourceKey,
        contentHash,
        pick
      )
    );
  }


  await env.DB.batch(
    statements
  );
}
