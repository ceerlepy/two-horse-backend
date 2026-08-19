import type {
  Env
} from "../env";

import type {
  OfficialMeetingResults
} from "./types";

import {
  attachOfficialResult
} from "../learning/repository";


function normalizeHorseName(
  value: string
): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g, " ");
}


interface FrozenRunner {
  horse_number: number;
  horse_name: string;
}


async function auditSkip(
  env: Env,
  input: {
    raceDate: string;
    city: string;
    raceNumber: number;
    reason: string;
    frozenCount: number;
    officialCount: number;
    detail?: string;
  }
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO learning_label_audit(
      race_date,
      city,
      race_number,
      attempted_at,
      reason,
      frozen_runner_count,
      official_runner_count,
      detail
    )
    VALUES(?,?,?,?,?,?,?,?)
  `)
    .bind(
      input.raceDate,
      input.city,
      input.raceNumber,
      new Date().toISOString(),
      input.reason,
      input.frozenCount,
      input.officialCount,
      input.detail ?? null
    )
    .run();
}


/*
 * Attach labels ONLY when official result runners
 * match our immutable pre-race runner set.
 *
 * A partial or mismatched result must never become
 * training data.
 */
export async function attachMeetingResultsToLearning(
  env: Env,
  result: OfficialMeetingResults
): Promise<{
  labelledRaces: number;
  labelledRunners: number;
  skippedRaces: number;
}> {
  let labelledRaces = 0;
  let labelledRunners = 0;
  let skippedRaces = 0;

  const labelledAt =
    new Date().toISOString();

  for (const race of result.races) {
    const frozen =
      await env.DB.prepare(`
        SELECT
          horse_number,
          horse_name

        FROM learning_runner_features

        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?

        ORDER BY horse_number
      `)
        .bind(
          result.raceDate,
          result.city,
          race.raceNumber
        )
        .all<FrozenRunner>();

    const expected =
      frozen.results ?? [];

    /*
     * No immutable pre-race snapshot means there is
     * nothing leakage-safe to train from.
     */
    if (expected.length === 0) {
      await auditSkip(
        env,
        {
          raceDate:
            result.raceDate,

          city:
            result.city,

          raceNumber:
            race.raceNumber,

          reason:
            "NO_FROZEN_SNAPSHOT",

          frozenCount: 0,

          officialCount:
            race.runners.length
        }
      );

      skippedRaces += 1;
      continue;
    }

    if (
      expected.length !==
      race.runners.length
    ) {
      await auditSkip(
        env,
        {
          raceDate:
            result.raceDate,

          city:
            result.city,

          raceNumber:
            race.raceNumber,

          reason:
            "RUNNER_COUNT_MISMATCH",

          frozenCount:
            expected.length,

          officialCount:
            race.runners.length
        }
      );

      skippedRaces += 1;
      continue;
    }

    const officialByNumber =
      new Map(
        race.runners.map(
          runner => [
            runner.horseNumber,
            runner
          ] as const
        )
      );

    let exactMatch = true;

    for (const frozenRunner of expected) {
      const official =
        officialByNumber.get(
          frozenRunner.horse_number
        );

      if (!official) {
        exactMatch = false;
        break;
      }

      /*
       * Horse number is primary identity.
       * Name comparison protects against a malformed
       * extraction attaching another horse's result.
       */
      if (
        normalizeHorseName(
          official.horseName
        ) !==
        normalizeHorseName(
          frozenRunner.horse_name
        )
      ) {
        exactMatch = false;
        break;
      }
    }

    if (!exactMatch) {
      await auditSkip(
        env,
        {
          raceDate:
            result.raceDate,

          city:
            result.city,

          raceNumber:
            race.raceNumber,

          reason:
            "RUNNER_IDENTITY_MISMATCH",

          frozenCount:
            expected.length,

          officialCount:
            race.runners.length
        }
      );

      skippedRaces += 1;
      continue;
    }

    /*
     * We validated the complete set BEFORE writing
     * even one label. No half-labelled race.
     */
    for (const runner of race.runners) {
      await attachOfficialResult(
        env,
        {
          raceDate:
            result.raceDate,

          city:
            result.city,

          raceNumber:
            race.raceNumber,

          horseNumber:
            runner.horseNumber,

          finishPosition:
            runner.finishPosition,

          labelledAt
        }
      );

      labelledRunners += 1;
    }

    labelledRaces += 1;
  }

  return {
    labelledRaces,
    labelledRunners,
    skippedRaces
  };
}
