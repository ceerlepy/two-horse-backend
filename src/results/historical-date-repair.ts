import type { Env } from "../env";

import {
  acquireOfficialResults
} from "./acquisition";

import {
  ingestOfficialResults
} from "./service";

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

type Runner = {
  raceNumber: number;
  horseNumber: number;
  horseName: string;
  normalizedName: string;
  finishPosition: number | null;
};


function validDate(value:string):boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}


function canonicalHorseName(value:string):string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/\s*\(\d+\)\s*$/u, "")
    .trim();
}


function normalizeHorseName(value:string):string {
  return canonicalHorseName(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/\s+/g,"")
    .replace(/[’'`´".,()\-_/\\]/g,"");
}


async function getRaces(
  env:Env,
  raceDate:string,
  city:string
) {
  const result =
    await env.DB.prepare(`
      SELECT *
      FROM learning_races
      WHERE race_date=?
        AND city=?
      ORDER BY race_number
    `)
    .bind(raceDate,city)
    .all<any>();

  return result.results ?? [];
}


async function getRunners(
  env:Env,
  raceDate:string,
  city:string
):Promise<Runner[]> {
  const result =
    await env.DB.prepare(`
      SELECT
        race_number,
        horse_number,
        horse_name,
        finish_position
      FROM learning_runner_features
      WHERE race_date=?
        AND city=?
      ORDER BY race_number,horse_number
    `)
    .bind(raceDate,city)
    .all<any>();

  return (result.results ?? []).map(row => ({
    raceNumber:Number(row.race_number),
    horseNumber:Number(row.horse_number),
    horseName:String(row.horse_name ?? ""),
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


function getOfficialRunners(value:any):Runner[] {
  return value.races.flatMap((race:any) =>
    race.runners.map((runner:any) => ({
      raceNumber:Number(race.raceNumber),
      horseNumber:Number(runner.horseNumber),
      horseName:String(runner.horseName ?? ""),
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


function runnerKey(r:Runner):string {
  return `${r.raceNumber}|${r.horseNumber}`;
}


function compare(
  left:Runner[],
  right:Runner[]
) {
  const a =
    new Map(
      left.map(r => [runnerKey(r),r])
    );

  const b =
    new Map(
      right.map(r => [runnerKey(r),r])
    );

  const keys =
    [...new Set([
      ...a.keys(),
      ...b.keys()
    ])];

  const mismatches:any[] = [];

  for (const key of keys) {
    const x=a.get(key);
    const y=b.get(key);

    if (!x || !y) {
      mismatches.push({
        key,
        left:x ?? null,
        right:y ?? null,
        type:"RUNNER_SET_MISMATCH"
      });

      continue;
    }

    if (
      x.normalizedName !==
      y.normalizedName
    ) {
      mismatches.push({
        raceNumber:x.raceNumber,
        horseNumber:x.horseNumber,
        leftName:x.horseName,
        rightName:y.horseName,
        type:"HORSE_NAME_MISMATCH"
      });
    }
  }

  return {
    match:
      left.length === right.length &&
      mismatches.length === 0,

    mismatchCount:
      mismatches.length,

    mismatches:
      mismatches.slice(0,20)
  };
}


async function deleteSourceIdentity(
  env:Env,
  storedDate:string,
  city:string
) {
  /*
   * Delete children before parent because
   * learning_runner_features references learning_races.
   */
  const results =
    await env.DB.batch([
      env.DB.prepare(`
        DELETE FROM learning_expert_picks
        WHERE race_date=? AND city=?
      `).bind(storedDate,city),

      env.DB.prepare(`
        DELETE FROM learning_label_audit
        WHERE race_date=? AND city=?
      `).bind(storedDate,city),

      env.DB.prepare(`
        DELETE FROM learning_snapshot_candidates
        WHERE race_date=? AND city=?
      `).bind(storedDate,city),

      env.DB.prepare(`
        DELETE FROM learning_runner_features
        WHERE race_date=? AND city=?
      `).bind(storedDate,city),

      env.DB.prepare(`
        DELETE FROM learning_races
        WHERE race_date=? AND city=?
      `).bind(storedDate,city),

      env.DB.prepare(`
        DELETE FROM official_result_runs
        WHERE race_date=? AND city=?
      `).bind(storedDate,city)
    ]);

  return results.length;
}


async function moveSourceIdentity(
  env:Env,
  storedDate:string,
  targetDate:string,
  city:string,
  sourceRaces:any[],
  official:any
) {
  /*
   * Parent rows must exist at target before child PKs move.
   */
  const inserts:D1PreparedStatement[]=[];

  for (const race of sourceRaces) {
    inserts.push(
      env.DB.prepare(`
        INSERT INTO learning_races(
          race_date,
          city,
          race_number,
          starts_at,
          distance_meters,
          track,
          snapshot_at,
          labelled_at,
          model_version,
          learning_policy_version,
          coupon_policy_version,
          coupon_mode,
          coupon_horse_numbers_json,
          coupon_confidence,
          coupon_expansion_pressure,
          coupon_reason
        )
        SELECT
          ?,
          city,
          race_number,
          CASE
            WHEN starts_at IS NULL
              THEN NULL
            ELSE ? || substr(starts_at,11)
          END,
          distance_meters,
          track,
          snapshot_at,
          labelled_at,
          model_version,
          learning_policy_version,
          coupon_policy_version,
          coupon_mode,
          coupon_horse_numbers_json,
          coupon_confidence,
          coupon_expansion_pressure,
          coupon_reason
        FROM learning_races
        WHERE race_date=?
          AND city=?
          AND race_number=?
      `).bind(
        targetDate,
        targetDate,
        storedDate,
        city,
        race.race_number
      )
    );
  }

  await env.DB.batch(inserts);


  /*
   * Move dependent identities.
   */
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE learning_runner_features
      SET race_date=?
      WHERE race_date=? AND city=?
    `).bind(targetDate,storedDate,city),

    env.DB.prepare(`
      UPDATE learning_expert_picks
      SET race_date=?
      WHERE race_date=? AND city=?
    `).bind(targetDate,storedDate,city),

    env.DB.prepare(`
      UPDATE learning_label_audit
      SET race_date=?
      WHERE race_date=? AND city=?
    `).bind(targetDate,storedDate,city),

    env.DB.prepare(`
      UPDATE learning_snapshot_candidates
      SET
        race_date=?,
        starts_at=? || substr(starts_at,11)
      WHERE race_date=? AND city=?
    `).bind(
      targetDate,
      targetDate,
      storedDate,
      city
    )
  ]);


  /*
   * Remove the obsolete parent identity.
   */
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM learning_races
      WHERE race_date=? AND city=?
    `).bind(storedDate,city),

    env.DB.prepare(`
      DELETE FROM official_result_runs
      WHERE race_date=? AND city=?
    `).bind(storedDate,city)
  ]);


  /*
   * Clean historical "(draw/order)" suffix from horse_name.
   * Match by race_number + horse_number against official TJK.
   */
  const updates:D1PreparedStatement[]=[];

  for (const race of official.races) {
    for (const runner of race.runners) {
      updates.push(
        env.DB.prepare(`
          UPDATE learning_runner_features
          SET horse_name=?
          WHERE race_date=?
            AND city=?
            AND race_number=?
            AND horse_number=?
        `).bind(
          canonicalHorseName(
            String(runner.horseName ?? "")
          ),
          targetDate,
          city,
          Number(race.raceNumber),
          Number(runner.horseNumber)
        )
      );
    }
  }

  if (updates.length) {
    await env.DB.batch(updates);
  }
}


async function processOne(
  env:Env,
  mapping:HistoricalDateRepairMapping,
  apply:boolean
) {
  const storedDate=
    String(mapping.storedDate ?? "");

  const targetDate=
    String(mapping.targetDate ?? "");

  const city=
    String(mapping.city ?? "").trim();


  if (
    !validDate(storedDate) ||
    !validDate(targetDate) ||
    !city ||
    storedDate === targetDate
  ) {
    return {
      storedDate,
      targetDate,
      city,
      action:"INVALID_MAPPING"
    };
  }


  const sourceRaces=
    await getRaces(
      env,
      storedDate,
      city
    );

  const targetRaces=
    await getRaces(
      env,
      targetDate,
      city
    );

  const source=
    await getRunners(
      env,
      storedDate,
      city
    );

  const target=
    await getRunners(
      env,
      targetDate,
      city
    );


  if (!sourceRaces.length) {
    return {
      storedDate,
      targetDate,
      city,
      action:
        targetRaces.length
          ? "ALREADY_REPAIRED"
          : "SOURCE_NOT_FOUND"
    };
  }


  const acquisition =
    await acquireOfficialResults(
      env,
      {
        raceDate:targetDate,
        city,
        url:
          buildOfficialResultsUrl(
            targetDate,
            city
          )
      }
    );


  const official=
    getOfficialRunners(
      acquisition.value
    );


  const sourceVsOfficial=
    compare(
      source,
      official
    );

  const targetVsOfficial=
    compare(
      target,
      official
    );

  const sourceVsTarget=
    compare(
      source,
      target
    );


  const sourceRaceNumbers =
    sourceRaces
      .map(r=>Number(r.race_number))
      .sort((a,b)=>a-b);

  const officialRaceNumbers =
    acquisition.value.races
      .map((r:any)=>Number(r.raceNumber))
      .sort((a:number,b:number)=>a-b);

  const sourceRaceMatch =
    JSON.stringify(sourceRaceNumbers) ===
    JSON.stringify(officialRaceNumbers);


  const sourceCorrect =
    sourceRaceMatch &&
    sourceVsOfficial.match;

  const collision =
    targetRaces.length > 0 ||
    target.length > 0;

  const targetCorrect =
    collision &&
    targetVsOfficial.match;


  let classification:string;

  if (
    !collision &&
    sourceCorrect
  ) {
    classification=
      "MOVE_SOURCE_TO_TARGET";
  }
  else if (
    collision &&
    sourceCorrect &&
    targetCorrect &&
    sourceVsTarget.match
  ) {
    classification=
      "DELETE_DUPLICATE_SOURCE";
  }
  else {
    classification=
      "MANUAL_REVIEW";
  }


  const base={
    storedDate,
    targetDate,
    city,

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

    sourceCorrect,
    targetCorrect,
    collision,
    classification,

    sourceVsOfficial:{
      match:
        sourceVsOfficial.match,
      mismatchCount:
        sourceVsOfficial.mismatchCount
    },

    targetVsOfficial:{
      match:
        targetVsOfficial.match,
      mismatchCount:
        targetVsOfficial.mismatchCount
    },

    sourceVsTarget:{
      match:
        sourceVsTarget.match,
      mismatchCount:
        sourceVsTarget.mismatchCount
    }
  };


  if (!apply) {
    return {
      ...base,
      action:
        classification ===
          "MOVE_SOURCE_TO_TARGET"
          ? "WOULD_MOVE"
          :
        classification ===
          "DELETE_DUPLICATE_SOURCE"
          ? "WOULD_DELETE_DUPLICATE_SOURCE"
          :
          "NEEDS_MANUAL_REVIEW"
    };
  }


  if (
    classification ===
    "MOVE_SOURCE_TO_TARGET"
  ) {
    await moveSourceIdentity(
      env,
      storedDate,
      targetDate,
      city,
      sourceRaces,
      acquisition.value
    );

    const labelled=
      await ingestOfficialResults(
        env,
        {
          raceDate:targetDate,
          city,
          url:
            buildOfficialResultsUrl(
              targetDate,
              city
            )
        }
      );

    return {
      ...base,
      action:
        "MOVED_AND_LABELLED",

      labelledRaces:
        labelled.labelledRaces,

      labelledRunners:
        labelled.labelledRunners
    };
  }


  if (
    classification ===
    "DELETE_DUPLICATE_SOURCE"
  ) {
    const mutationStatements=
      await deleteSourceIdentity(
        env,
        storedDate,
        city
      );

    return {
      ...base,
      action:
        "DUPLICATE_SOURCE_DELETED",

      mutationStatements
    };
  }


  return {
    ...base,
    action:
      "NEEDS_MANUAL_REVIEW"
  };
}


export async function repairHistoricalDates(
  env:Env,
  input:HistoricalDateRepairInput
) {
  const mappings=
    Array.isArray(input?.mappings)
      ? input.mappings
      : [];

  if (!mappings.length) {
    throw new Error(
      "REPAIR_MAPPINGS_REQUIRED"
    );
  }

  if (mappings.length > 20) {
    throw new Error(
      "REPAIR_MAPPING_LIMIT_EXCEEDED"
    );
  }


  const seen=
    new Set<string>();

  for (const m of mappings) {
    const key=
      `${m.storedDate}|${m.city}`;

    if (seen.has(key)) {
      throw new Error(
        `DUPLICATE_SOURCE_MAPPING:${key}`
      );
    }

    seen.add(key);
  }


  const apply=
    input.apply === true;

  const meetings=[];

  for (const mapping of mappings) {
    meetings.push(
      await processOne(
        env,
        mapping,
        apply
      )
    );
  }


  const pendingRaces=
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM learning_races
      WHERE labelled_at IS NULL
    `).first<any>();

  const pendingRunners=
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM learning_runner_features
      WHERE finish_position IS NULL
    `).first<any>();


  return {
    ok:
      meetings.every(
        (m:any) =>
          m.action !==
          "NEEDS_MANUAL_REVIEW"
      ),

    dryRun:!apply,

    summary:{
      attemptedMeetings:
        meetings.length,

      wouldMove:
        meetings.filter(
          (m:any)=>
            m.action === "WOULD_MOVE"
        ).length,

      wouldDeleteDuplicate:
        meetings.filter(
          (m:any)=>
            m.action ===
            "WOULD_DELETE_DUPLICATE_SOURCE"
        ).length,

      moved:
        meetings.filter(
          (m:any)=>
            m.action ===
            "MOVED_AND_LABELLED"
        ).length,

      duplicateSourcesDeleted:
        meetings.filter(
          (m:any)=>
            m.action ===
            "DUPLICATE_SOURCE_DELETED"
        ).length,

      manualReview:
        meetings.filter(
          (m:any)=>
            m.action ===
            "NEEDS_MANUAL_REVIEW"
        ).length,

      remainingPendingRaces:
        Number(
          pendingRaces?.count ?? 0
        ),

      remainingPendingRunners:
        Number(
          pendingRunners?.count ?? 0
        )
    },

    meetings
  };
}
