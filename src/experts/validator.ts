import type {
  Env
} from "../env";

import type {
  ExpertPickInput
} from "../types/models";

import {
  turkeyDate
} from "../shared";

export async function validateExpertPicks(
  env: Env,
  picks:
    ExpertPickInput[]
): Promise<ExpertPickInput[]> {
  const output:
    ExpertPickInput[] = [];

  const date =
    turkeyDate();

  for (
    const pick of picks
  ) {
    const horse =
      await env.DB.prepare(`
        SELECT
          horse_name
        FROM runners
        WHERE race_date = ?
          AND city = ?
            COLLATE NOCASE
          AND race_number = ?
          AND horse_number = ?
      `)
        .bind(
          date,
          pick.city,
          pick.raceNumber,
          pick.horseNumber
        )
        .first<any>();

    if (
      horse &&
      horse.horse_name
    ) {
      /*
       * TJK stays canonical for horse identity.
       */
      output.push({
        ...pick,
        horseName:
          horse.horse_name
      });

      continue;
    }

    await env.DB.prepare(`
      INSERT INTO anomalies(
        race_id,
        source_key,
        anomaly_type,
        reason,
        raw_payload,
        created_at
      )
      VALUES(
        ?,?,?,?,?,
        CURRENT_TIMESTAMP
      )
    `)
      .bind(
        `${date}|${pick.city}|${pick.raceNumber}`,
        "expert",
        "horse_mismatch",
        "Extracted expert pick did not match canonical TJK runner",
        JSON.stringify(
          pick
        )
      )
      .run();
  }

  return output;
}
