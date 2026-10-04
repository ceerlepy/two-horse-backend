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


/*
 * Race-block consistency.
 *
 * Workers AI returns picks grouped by (city, race). Live D1 showed
 * whole groups attributed to the WRONG CITY of a multi-city article:
 * 2026-10-04 "Adana 6" received horses 9/12/13 although Adana 6 had
 * 8 runners (İstanbul 6 had 13), and 2026-10-03 "İzmir 6" received
 * horse 11 although İzmir 6 had 9 runners (Diyarbakır 6 had 12).
 *
 * A pick-by-pick check only drops the impossible numbers and keeps
 * the rest of the same mis-attributed group, which then lands on
 * real but WRONG horses. So a group that contains an impossible
 * pick is treated as untrusted as a whole:
 *
 * 1. If exactly one other city running the same race number
 *    resolves every pick of the group, and at least one pick in the
 *    group carries a horse NAME that matches there, the group is
 *    moved to that city (names are independent identity evidence).
 * 2. Otherwise only picks whose supplied name matches the claimed
 *    race are kept; number-only picks of that group are dropped,
 *    because their numbers cannot be trusted.
 *
 * Groups where every pick resolves are untouched.
 */
export type ExpertBlockDecision =
  | {
      kind:
        "accepted";

      pick:
        ExpertPickInput;

      runner:
        CanonicalExpertRunner;

      relocatedFrom?:
        string;
    }
  | {
      kind:
        "rejected";

      pick:
        ExpertPickInput;

      reason:
        | "EXPERT_CANONICAL_IDENTITY_NOT_FOUND"
        | "EXPERT_RACE_BLOCK_UNTRUSTED";
    };


function nameVerified(
  pick:
    ExpertPickIdentity,

  resolved:
    ReturnType<
      typeof resolveCanonicalRunnerForPick
    >
): boolean {
  const supplied =
    String(
      pick.horseName ??
      ""
    ).trim();

  return Boolean(
    supplied &&
    resolved &&
    (
      resolved.method ===
        "exact" ||
      resolved.method ===
        "same-race-name"
    )
  );
}


export function planExpertRaceBlocks(
  runners:
    CanonicalExpertRunner[],

  picks:
    ExpertPickInput[]
): ExpertBlockDecision[] {
  const groups =
    new Map<
      string,
      ExpertPickInput[]
    >();


  for (const pick of picks) {
    const key =
      [
        normalizeCity(
          pick.city
        ),
        pick.raceNumber
      ].join("|");

    const group =
      groups.get(key) ??
      [];

    group.push(pick);

    groups.set(
      key,
      group
    );
  }


  const decisions:
    ExpertBlockDecision[] = [];


  for (const group of groups.values()) {
    const resolutions =
      group.map(
        pick =>
          resolveCanonicalRunnerForPick(
            runners,
            pick
          )
      );


    if (
      resolutions.every(
        Boolean
      )
    ) {
      group.forEach(
        (pick, index) =>
          decisions.push({
            kind:
              "accepted",

            pick,

            runner:
              resolutions[index]!
                .runner
          })
      );

      continue;
    }


    const claimedCity =
      normalizeCity(
        group[0].city
      );

    const raceNumber =
      group[0].raceNumber;

    const alternativeCities =
      [
        ...new Set(
          runners
            .filter(
              runner =>
                runner.raceNumber ===
                  raceNumber &&
                normalizeCity(
                  runner.city
                ) !==
                  claimedCity
            )
            .map(
              runner =>
                runner.city
            )
        )
      ];


    const relocations =
      alternativeCities
        .map(city => {
          const moved =
            group.map(
              pick => ({
                ...pick,
                city
              })
            );

          const resolved =
            moved.map(
              pick =>
                resolveCanonicalRunnerForPick(
                  runners,
                  pick
                )
            );

          const named =
            moved.filter(
              pick =>
                String(
                  pick.horseName ??
                  ""
                ).trim()
            );

          const ok =
            resolved.every(
              Boolean
            ) &&
            named.length > 0 &&
            moved.every(
              (pick, index) =>
                !String(
                  pick.horseName ??
                  ""
                ).trim() ||
                nameVerified(
                  pick,
                  resolved[index]
                )
            );

          return ok
            ? {
                city,
                moved,
                resolved
              }
            : null;
        })
        .filter(
          (value): value is NonNullable<typeof value> =>
            value !== null
        );


    if (
      relocations.length ===
        1
    ) {
      const relocation =
        relocations[0];

      relocation.moved.forEach(
        (pick, index) =>
          decisions.push({
            kind:
              "accepted",

            pick,

            runner:
              relocation.resolved[index]!
                .runner,

            relocatedFrom:
              group[0].city
          })
      );

      continue;
    }


    group.forEach(
      (pick, index) => {
        const resolved =
          resolutions[index];

        if (
          resolved &&
          nameVerified(
            pick,
            resolved
          )
        ) {
          decisions.push({
            kind:
              "accepted",

            pick,

            runner:
              resolved.runner
          });

          return;
        }

        decisions.push({
          kind:
            "rejected",

          pick,

          reason:
            resolved
              ? "EXPERT_RACE_BLOCK_UNTRUSTED"
              : "EXPERT_CANONICAL_IDENTITY_NOT_FOUND"
        });
      }
    );
  }


  return decisions;
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
  /*
   * The same article is re-checked many times a day; record each
   * distinct anomaly once per day instead of on every check
   * (live D1 had the same three picks logged 64 times).
   */
  const raceId =
    `${raceDate}|${pick.city}|${pick.raceNumber}`;

  const payload =
    JSON.stringify({
      pick,
      extra
    });

  await env.DB.prepare(`
    INSERT INTO anomalies(
      race_id,
      source_key,
      anomaly_type,
      reason,
      raw_payload,
      created_at
    )
    SELECT
      ?,?,?,?,?,CURRENT_TIMESTAMP
    WHERE NOT EXISTS (
      SELECT 1
      FROM anomalies
      WHERE race_id = ?
        AND reason = ?
        AND raw_payload = ?
        AND created_at >
          datetime(
            'now',
            '-1 day'
          )
    )
  `)
    .bind(
      raceId,
      "expert",
      "horse_mismatch",
      reason,
      payload,
      raceId,
      reason,
      payload
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
    const decision of
    planExpertRaceBlocks(
      runners,
      picks
    )
  ) {
    const pick =
      decision.pick;


    if (
      decision.kind ===
        "rejected"
    ) {
      if (writeAnomalies) {
        await writeMismatch(
          env,
          raceDate,
          pick,
          decision.reason
        );
      }


      continue;
    }


    if (
      decision.relocatedFrom &&
      writeAnomalies
    ) {
      await writeMismatch(
        env,
        raceDate,
        pick,
        "EXPERT_CITY_REASSIGNED",
        {
          from:
            decision.relocatedFrom
        }
      );
    }


    const runner =
      decision.runner;


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
