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
  value:
    string
): string {
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
  value:
    string
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(
      /\s*\d+\s*$/u,
      ""
    )
    .replace(/\s+/g,"")
    .replace(/[’'`´".,()\-_/\\]/g,"");
}


function identityKey(
  city:
    string,

  raceNumber:
    number,

  horseNumber:
    number
): string {
  return [
    normalizeCity(city),
    raceNumber,
    horseNumber
  ].join("|");
}


async function writeMismatch(
  env:
    Env,

  raceDate:
    string,

  pick:
    ExpertPickInput,

  reason:
    string,

  extra:
    unknown = null
): Promise<void> {
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
      ?,?,?,?,?,CURRENT_TIMESTAMP
    )
  `)
    .bind(
      `${raceDate}|${pick.city}|${pick.raceNumber}`,
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
  env:
    Env,

  picks:
    ExpertPickInput[],

  raceDate =
    turkeyDate(),

  options:
    {
      writeAnomalies?:
        boolean;
    } = {}
): Promise<ExpertPickInput[]> {
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
      .bind(
        raceDate
      )
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


  for (
    const row of
    rows.results ??
    []
  ) {
    const runner = {
      city:
        String(row.city),

      raceNumber:
        Number(
          row.race_number
        ),

      horseNumber:
        Number(
          row.horse_number
        ),

      horseName:
        String(
          row.horse_name
        )
    };


    canonical.set(
      identityKey(
        runner.city,
        runner.raceNumber,
        runner.horseNumber
      ),
      runner
    );
  }


  const output:
    ExpertPickInput[] = [];


  const writeAnomalies =
    options.writeAnomalies !==
    false;


  for (const pick of picks) {
    const runner =
      canonical.get(
        identityKey(
          pick.city,
          pick.raceNumber,
          pick.horseNumber
        )
      );


    if (!runner) {
      if (writeAnomalies) {
        await writeMismatch(
          env,
          raceDate,
          pick,
          "EXPERT_RUNNER_KEY_NOT_FOUND"
        );
      }

      continue;
    }


    const suppliedName =
      String(
        pick.horseName ??
        ""
      )
        .trim();


    if (suppliedName) {
      const sourceName =
        normalizeHorseName(
          suppliedName
        );


      const officialName =
        normalizeHorseName(
          runner.horseName
        );


      if (
        sourceName !==
        officialName
      ) {
        if (writeAnomalies) {
          await writeMismatch(
            env,
            raceDate,
            pick,
            "EXPERT_HORSE_NAME_MISMATCH",
            {
              canonicalHorseName:
                runner.horseName
            }
          );
        }

        continue;
      }
    }


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
