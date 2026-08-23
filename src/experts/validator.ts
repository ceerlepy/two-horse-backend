import type {
  Env
} from "../env";

import type {
  ExpertPickInput
} from "../types/models";

import {
  turkeyDate
} from "../shared";


function normalizeCity(
  value:string
):string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[İIıi]/g,"I")
    .replace(/Ğ/g,"G")
    .replace(/Ü/g,"U")
    .replace(/Ş/g,"S")
    .replace(/Ö/g,"O")
    .replace(/Ç/g,"C")
    .replace(/[^A-Z0-9]/g,"");
}


function normalizeHorseName(
  value:string
):string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("tr-TR")

    /*
     * Some source text appends draw/order:
     * HORSE NAME (3)
     */
    .replace(/\s*\(\d+\)\s*$/u,"")

    .replace(/\s+/g,"")
    .replace(/[’'`´".,()\-_/\\]/g,"");
}


function identityKey(
  city:string,
  raceNumber:number,
  horseNumber:number
):string {
  return [
    normalizeCity(city),
    raceNumber,
    horseNumber
  ].join("|");
}


async function writeMismatch(
  env:Env,
  date:string,
  pick:ExpertPickInput,
  reason:string,
  extra:unknown = null
):Promise<void> {
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
      reason,
      JSON.stringify({
        pick,
        extra
      })
    )
    .run();
}


export async function validateExpertPicks(
  env:Env,
  picks:ExpertPickInput[]
):Promise<ExpertPickInput[]> {
  const date =
    turkeyDate();


  /*
   * TJK is the canonical identity source.
   */
  const rows =
    await env.DB.prepare(`
      SELECT
        city,
        race_number,
        horse_number,
        horse_name

      FROM runners

      WHERE race_date = ?
    `)
      .bind(date)
      .all<any>();


  const canonical =
    new Map<
      string,
      {
        city:string;
        raceNumber:number;
        horseNumber:number;
        horseName:string;
      }
    >();


  for (const row of rows.results ?? []) {
    const item = {
      city:
        String(row.city),

      raceNumber:
        Number(row.race_number),

      horseNumber:
        Number(row.horse_number),

      horseName:
        String(row.horse_name)
    };

    canonical.set(
      identityKey(
        item.city,
        item.raceNumber,
        item.horseNumber
      ),
      item
    );
  }


  const output:
    ExpertPickInput[] = [];


  for (const pick of picks) {
    const runner =
      canonical.get(
        identityKey(
          pick.city,
          Number(pick.raceNumber),
          Number(pick.horseNumber)
        )
      );


    if (!runner) {
      await writeMismatch(
        env,
        date,
        pick,
        "EXPERT_RUNNER_KEY_NOT_FOUND"
      );

      continue;
    }


    /*
     * city + race number + horse number identifies the
     * canonical TJK runner for the current race date.
     *
     * If the source ALSO printed a horse name, require
     * that name to identify the same canonical runner.
     *
     * Some legitimate expert formats list rivals only
     * by horse number. In that case horseName is null
     * and the official TJK name is filled below.
     */
    const sourceHorseName =
      String(
        pick.horseName ??
        ""
      ).trim();


    if (sourceHorseName) {
      const extractedName =
        normalizeHorseName(
          sourceHorseName
        );

      const canonicalName =
        normalizeHorseName(
          runner.horseName
        );


      if (
        extractedName !==
          canonicalName
      ) {
        await writeMismatch(
          env,
          date,
          pick,
          "EXPERT_HORSE_NAME_MISMATCH",
          {
            canonicalCity:
              runner.city,

            canonicalHorseName:
              runner.horseName,

            normalizedExtracted:
              extractedName,

            normalizedCanonical:
              canonicalName
          }
        );

        continue;
      }
    }


    /*
     * Identity is canonical now.
     *
     * Always persist official TJK spelling, including
     * number-only source picks whose horseName was null.
     */
    output.push({
      ...pick,

      city:
        runner.city,

      raceNumber:
        runner.raceNumber,

      horseNumber:
        runner.horseNumber,

      horseName:
        runner.horseName
    });
  }


  return output;
}
