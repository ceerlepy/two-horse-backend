import type { Env } from "../env";

import {
  acquireOfficialResults
} from "./acquisition";

import {
  buildOfficialResultsUrl
} from "./url";


export interface HistoricalDateRepairMapping {
  storedDate: string;
  targetDate: string;
  city: string;
}

export interface HistoricalDateRepairInput {
  mappings: HistoricalDateRepairMapping[];
  apply?: boolean;
}


type RunnerIdentity = {
  raceNumber: number;
  horseNumber: number;
  horseName: string;
  normalizedName: string;
  finishPosition: number | null;
};


function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}


function normalizeHorseName(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleUpperCase("tr-TR")
    // Frozen snapshots may contain a trailing draw/order marker,
    // e.g. "SANCAKALAN (3)". This is not part of the horse identity.
    .replace(/\s*\(\d+\)\s*$/u, "")
    .replace(/\s+/g, "")
    .replace(/[’'`´".,()\-_/\\]/g, "");
}


async function getLearningRaces(
  env: Env,
  raceDate: string,
  city: string
) {
  const result =
    await env.DB.prepare(`
      SELECT
        race_number,
        starts_at,
        labelled_at
      FROM learning_races
      WHERE race_date = ?
        AND city = ?
      ORDER BY race_number
    `)
      .bind(raceDate, city)
      .all<any>();

  return result.results ?? [];
}


async function getLearningRunners(
  env: Env,
  raceDate: string,
  city: string
): Promise<RunnerIdentity[]> {
  const result =
    await env.DB.prepare(`
      SELECT
        race_number,
        horse_number,
        horse_name,
        finish_position
      FROM learning_runner_features
      WHERE race_date = ?
        AND city = ?
      ORDER BY race_number, horse_number
    `)
      .bind(raceDate, city)
      .all<any>();

  return (result.results ?? []).map(row => ({
    raceNumber: Number(row.race_number),
    horseNumber: Number(row.horse_number),
    horseName: String(row.horse_name ?? ""),
    normalizedName:
      normalizeHorseName(
        String(row.horse_name ?? "")
      ),
    finishPosition:
      row.finish_position == null
        ? null
        : Number(row.finish_position)
  }));
}


function officialRunners(official: any): RunnerIdentity[] {
  return official.races.flatMap((race: any) =>
    race.runners.map((runner: any) => ({
      raceNumber:
        Number(race.raceNumber),

      horseNumber:
        Number(runner.horseNumber),

      horseName:
        String(runner.horseName ?? ""),

      normalizedName:
        normalizeHorseName(
          String(runner.horseName ?? "")
        ),

      finishPosition:
        runner.finishPosition == null
          ? null
          : Number(runner.finishPosition)
    }))
  );
}


function key(runner: RunnerIdentity): string {
  return `${runner.raceNumber}|${runner.horseNumber}`;
}


function compare(
  left: RunnerIdentity[],
  right: RunnerIdentity[],
  leftLabel: string,
  rightLabel: string
) {
  const leftMap =
    new Map(
      left.map(r => [key(r), r])
    );

  const rightMap =
    new Map(
      right.map(r => [key(r), r])
    );

  const keys =
    [...new Set([
      ...leftMap.keys(),
      ...rightMap.keys()
    ])].sort();

  const mismatches: any[] = [];

  for (const id of keys) {
    const a = leftMap.get(id);
    const b = rightMap.get(id);

    if (!a) {
      mismatches.push({
        mismatchType:
          `${rightLabel.toUpperCase()}_ONLY_RUNNER`,

        raceNumber:
          b?.raceNumber,

        horseNumber:
          b?.horseNumber,

        [rightLabel + "Name"]:
          b?.horseName,

        ["normalized" +
          rightLabel[0].toUpperCase() +
          rightLabel.slice(1) +
          "Name"]:
          b?.normalizedName
      });

      continue;
    }

    if (!b) {
      mismatches.push({
        mismatchType:
          `${leftLabel.toUpperCase()}_ONLY_RUNNER`,

        raceNumber:
          a.raceNumber,

        horseNumber:
          a.horseNumber,

        [leftLabel + "Name"]:
          a.horseName,

        ["normalized" +
          leftLabel[0].toUpperCase() +
          leftLabel.slice(1) +
          "Name"]:
          a.normalizedName
      });

      continue;
    }

    if (
      a.normalizedName !==
      b.normalizedName
    ) {
      mismatches.push({
        mismatchType:
          "HORSE_NAME_MISMATCH",

        raceNumber:
          a.raceNumber,

        horseNumber:
          a.horseNumber,

        [leftLabel + "Name"]:
          a.horseName,

        [rightLabel + "Name"]:
          b.horseName,

        ["normalized" +
          leftLabel[0].toUpperCase() +
          leftLabel.slice(1) +
          "Name"]:
          a.normalizedName,

        ["normalized" +
          rightLabel[0].toUpperCase() +
          rightLabel.slice(1) +
          "Name"]:
          b.normalizedName
      });
    }
  }

  return {
    match:
      mismatches.length === 0 &&
      left.length === right.length,

    leftCount:
      left.length,

    rightCount:
      right.length,

    mismatchCount:
      mismatches.length,

    mismatches
  };
}


async function diagnoseOne(
  env: Env,
  mapping: HistoricalDateRepairMapping
) {
  const storedDate =
    String(mapping.storedDate ?? "");

  const targetDate =
    String(mapping.targetDate ?? "");

  const city =
    String(mapping.city ?? "").trim();


  if (
    !validDate(storedDate) ||
    !validDate(targetDate) ||
    !city
  ) {
    return {
      storedDate,
      targetDate,
      city,
      action:
        "INVALID_MAPPING"
    };
  }


  const sourceRaces =
    await getLearningRaces(
      env,
      storedDate,
      city
    );

  const targetRaces =
    await getLearningRaces(
      env,
      targetDate,
      city
    );

  const source =
    await getLearningRunners(
      env,
      storedDate,
      city
    );

  const target =
    await getLearningRunners(
      env,
      targetDate,
      city
    );


  let acquisition;

  try {
    acquisition =
      await acquireOfficialResults(
        env,
        {
          raceDate: targetDate,
          city,

          url:
            buildOfficialResultsUrl(
              targetDate,
              city
            )
        }
      );
  } catch (error) {
    return {
      storedDate,
      targetDate,
      city,

      sourceRaceCount:
        sourceRaces.length,

      targetRaceCount:
        targetRaces.length,

      sourceRunnerCount:
        source.length,

      targetRunnerCount:
        target.length,

      action:
        "OFFICIAL_ACQUISITION_FAILED",

      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }


  const official =
    officialRunners(
      acquisition.value
    );


  const sourceVsOfficial =
    compare(
      source,
      official,
      "source",
      "official"
    );

  const targetVsOfficial =
    compare(
      target,
      official,
      "target",
      "official"
    );

  const sourceVsTarget =
    compare(
      source,
      target,
      "source",
      "target"
    );


  const collision =
    targetRaces.length > 0 ||
    target.length > 0;


  let classification: string;


  if (!collision) {
    classification =
      sourceVsOfficial.match
        ? "SOURCE_MATCHES_OFFICIAL"
        : "SOURCE_MISMATCH";
  } else if (
    sourceVsOfficial.match &&
    targetVsOfficial.match
  ) {
    classification =
      "SOURCE_AND_TARGET_SAME_OFFICIAL_MEETING";
  } else if (
    !sourceVsOfficial.match &&
    targetVsOfficial.match
  ) {
    classification =
      "TARGET_CORRECT_SOURCE_CONFLICT";
  } else if (
    sourceVsOfficial.match &&
    !targetVsOfficial.match
  ) {
    classification =
      "SOURCE_CORRECT_TARGET_CONFLICT";
  } else {
    classification =
      "NEITHER_MATCHES_OFFICIAL";
  }


  return {
    storedDate,
    targetDate,
    city,

    acquisitionMethod:
      acquisition.method,

    collision,

    sourceRaceCount:
      sourceRaces.length,

    targetRaceCount:
      targetRaces.length,

    officialRaceCount:
      acquisition.value.races.length,

    sourceRunnerCount:
      source.length,

    targetRunnerCount:
      target.length,

    officialRunnerCount:
      official.length,

    classification,

    sourceVsOfficial,
    targetVsOfficial,
    sourceVsTarget,

    action:
      "DIAGNOSTIC_ONLY_NO_MUTATION"
  };
}


export async function repairHistoricalDates(
  env: Env,
  input: HistoricalDateRepairInput
) {
  const mappings =
    Array.isArray(input?.mappings)
      ? input.mappings
      : [];


  if (mappings.length === 0) {
    throw new Error(
      "REPAIR_MAPPINGS_REQUIRED"
    );
  }


  if (mappings.length > 20) {
    throw new Error(
      "REPAIR_MAPPING_LIMIT_EXCEEDED"
    );
  }


  /*
   * IMPORTANT:
   * This version is intentionally diagnostic-only.
   * Even apply:true CANNOT mutate production.
   */
  const meetings = [];

  for (const mapping of mappings) {
    meetings.push(
      await diagnoseOne(
        env,
        mapping
      )
    );
  }


  return {
    ok: true,

    dryRun: true,

    diagnosticOnly: true,

    mutationAllowed: false,

    summary: {
      attemptedMeetings:
        meetings.length,

      collisions:
        meetings.filter(
          (m: any) =>
            m.collision === true
        ).length,

      sourceMatchesOfficial:
        meetings.filter(
          (m: any) =>
            m.sourceVsOfficial?.match ===
            true
        ).length,

      targetMatchesOfficial:
        meetings.filter(
          (m: any) =>
            m.targetVsOfficial?.match ===
            true
        ).length
    },

    meetings
  };
}
