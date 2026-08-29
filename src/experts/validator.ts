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


export function normalizeExpertHorseName(
  value:
    string
): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(
      /\s*[(][0-9]+[)]\s*$/u,
      ""
    )
    .replace(/\s+/g,"")
    .replace(
      /[’'`´".,()_\/\\-]/g,
      ""
    );
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
    normalizeCity(
      city
    ),
    raceNumber,
    horseNumber
  ].join("|");
}


function sameRaceNameKey(
  city:
    string,

  raceNumber:
    number,

  horseName:
    string
): string {
  return [
    normalizeCity(
      city
    ),
    raceNumber,
    normalizeExpertHorseName(
      horseName
    )
  ].join("|");
}


export interface CanonicalExpertRunner {
  city:
    string;

  raceNumber:
    number;

  horseNumber:
    number;

  horseName:
    string;
}


export interface ExpertPickIdentity {
  city:
    string;

  raceNumber:
    number;

  horseNumber:
    number;

  horseName?:
    string | null;
}


export function resolveCanonicalRunnerForPick(
  runners:
    CanonicalExpertRunner[],

  pick:
    ExpertPickIdentity
): {
  runner:
    CanonicalExpertRunner;

  method:
    "exact" |
    "same-race-name" |
    "exact-number-name-mismatch";
} | null {
  const exact =
    runners.find(
      runner =>
        identityKey(
          runner.city,
          runner.raceNumber,
          runner.horseNumber
        ) ===
        identityKey(
          pick.city,
          pick.raceNumber,
          pick.horseNumber
        )
    );


  const suppliedName =
    String(
      pick.horseName ??
      ""
    )
      .trim();


  if (exact) {
    if (!suppliedName) {
      return {
        runner:
          exact,

        method:
          "exact"
      };
    }


    if (
      normalizeExpertHorseName(
        suppliedName
      ) ===
      normalizeExpertHorseName(
        exact.horseName
      )
    ) {
      return {
        runner:
          exact,

        method:
          "exact"
      };
    }
  }


  /*
   * Deterministic fallback:
   *
   * - city may NOT change
   * - raceNumber may NOT change
   * - exact normalized horseName must uniquely match
   *
   * Only horseNumber can be corrected. This is checked BEFORE
   * trusting a mismatched exact numeric identity below, since a
   * unique name match on a DIFFERENT horseNumber is stronger
   * evidence of a swapped/mistyped number than of a mistyped name.
   */
  if (suppliedName) {
    const wanted =
      sameRaceNameKey(
        pick.city,
        pick.raceNumber,
        suppliedName
      );


    const matches =
      runners.filter(
        runner =>
          sameRaceNameKey(
            runner.city,
            runner.raceNumber,
            runner.horseName
          ) ===
          wanted
      );


    if (
      matches.length ===
        1
    ) {
      return {
        runner:
          matches[0],

        method:
          "same-race-name"
      };
    }
  }


  /*
   * city + raceNumber + horseNumber already uniquely identify one
   * real runner (the program number is a positional identity the
   * article states explicitly, e.g. "(5) KING ÇAĞDAŞ"). A supplied
   * name that doesn't match it AND doesn't uniquely match any other
   * runner in the race is most likely a transcription slip on the
   * name of that same, already-pinned horse — not evidence it's the
   * wrong horse. Trust the numeric identity and use the canonical
   * name.
   */
  if (exact) {
    return {
      runner:
        exact,

      method:
        "exact-number-name-mismatch"
    };
  }


  return null;
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


  const runners:
    CanonicalExpertRunner[] =
    (
      rows.results ??
      []
    )
      .map(
        row => ({
          city:
            String(
              row.city
            ),

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
        })
      );


  const output:
    ExpertPickInput[] = [];


  const writeAnomalies =
    options.writeAnomalies !==
      false;


  for (
    const pick of
    picks
  ) {
    const resolved =
      resolveCanonicalRunnerForPick(
        runners,
        pick
      );


    if (!resolved) {
      if (writeAnomalies) {
        await writeMismatch(
          env,
          raceDate,
          pick,
          "EXPERT_CANONICAL_IDENTITY_NOT_FOUND"
        );
      }


      continue;
    }


    const runner =
      resolved.runner;


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
