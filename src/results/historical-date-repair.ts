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


function validDate(
  value: string
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    value
  );
}


function normalizeHorseName(
  value: string
): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(
      /[^0-9A-ZÇĞİÖŞÜ]/g,
      ""
    );
}


function replaceDatePrefix(
  value: string | null,
  targetDate: string
): string | null {
  if (!value) {
    return null;
  }

  if (value.length < 10) {
    return value;
  }

  return (
    targetDate +
    value.slice(10)
  );
}


async function countIdentity(
  env: Env,
  table: string,
  raceDate: string,
  city: string
): Promise<number> {
  /*
   * Table names are INTERNAL constants only.
   * Never pass arbitrary HTTP input here.
   */
  const allowed =
    new Set([
      "learning_races",
      "learning_runner_features",
      "learning_expert_picks",
      "learning_snapshot_candidates",
      "learning_label_audit",
      "official_result_runs"
    ]);

  if (!allowed.has(table)) {
    throw new Error(
      "INVALID_INTERNAL_TABLE"
    );
  }

  const row =
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM ${table}
      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        raceDate,
        city
      )
      .first<any>();

  return Number(
    row?.count ?? 0
  );
}


async function repairOne(
  env: Env,
  mapping: HistoricalDateRepairMapping,
  apply: boolean
): Promise<any> {
  const {
    storedDate,
    targetDate
  } = mapping;

  const city =
    mapping.city.trim();


  if (
    !validDate(storedDate) ||
    !validDate(targetDate)
  ) {
    return {
      ...mapping,
      validated: false,
      repaired: false,
      action:
        "REJECT_INVALID_DATE"
    };
  }


  if (!city) {
    return {
      ...mapping,
      validated: false,
      repaired: false,
      action:
        "REJECT_INVALID_CITY"
    };
  }


  if (storedDate === targetDate) {
    return {
      ...mapping,
      validated: false,
      repaired: false,
      action:
        "REJECT_SAME_DATE"
    };
  }


  const storedRaces =
    await env.DB.prepare(`
      SELECT
        race_number,
        starts_at,
        labelled_at

      FROM learning_races

      WHERE
        race_date = ?
        AND city = ?

      ORDER BY race_number
    `)
      .bind(
        storedDate,
        city
      )
      .all<any>();


  const storedRaceRows =
    storedRaces.results ?? [];


  /*
   * Idempotency:
   *
   * If source disappeared but target exists,
   * treat it as an already repaired identity.
   */
  if (storedRaceRows.length === 0) {
    const targetCount =
      await countIdentity(
        env,
        "learning_races",
        targetDate,
        city
      );

    return {
      ...mapping,
      city,

      validated:
        targetCount > 0,

      repaired: false,

      action:
        targetCount > 0
          ? "ALREADY_REPAIRED"
          : "SOURCE_NOT_FOUND",

      targetRaceCount:
        targetCount
    };
  }


  /*
   * Collision guard.
   *
   * Any existing target learning identity means
   * we refuse to merge/overwrite.
   */
  const targetCounts = {
    learningRaces:
      await countIdentity(
        env,
        "learning_races",
        targetDate,
        city
      ),

    runnerFeatures:
      await countIdentity(
        env,
        "learning_runner_features",
        targetDate,
        city
      ),

    expertPicks:
      await countIdentity(
        env,
        "learning_expert_picks",
        targetDate,
        city
      ),

    candidates:
      await countIdentity(
        env,
        "learning_snapshot_candidates",
        targetDate,
        city
      )
  };


  if (
    targetCounts.learningRaces > 0 ||
    targetCounts.runnerFeatures > 0 ||
    targetCounts.expertPicks > 0 ||
    targetCounts.candidates > 0
  ) {
    return {
      ...mapping,
      city,

      validated: false,
      repaired: false,

      collision: true,
      targetCounts,

      action:
        "ABORT_TARGET_COLLISION"
    };
  }


  const frozen =
    await env.DB.prepare(`
      SELECT
        race_number,
        horse_number,
        horse_name,
        finish_position

      FROM learning_runner_features

      WHERE
        race_date = ?
        AND city = ?

      ORDER BY
        race_number,
        horse_number
    `)
      .bind(
        storedDate,
        city
      )
      .all<any>();


  const frozenRows =
    frozen.results ?? [];


  if (frozenRows.length === 0) {
    return {
      ...mapping,
      city,

      validated: false,
      repaired: false,

      action:
        "NO_FROZEN_RUNNERS"
    };
  }


  /*
   * EXTERNAL TRUTH
   *
   * Fetch official results from TARGET date.
   */
  let officialAcquisition;

  try {
    officialAcquisition =
      await acquireOfficialResults(
        env,
        {
          raceDate:
            targetDate,

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
      ...mapping,
      city,

      validated: false,
      repaired: false,

      action:
        "OFFICIAL_RESULT_ACQUISITION_FAILED",

      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }


  const official =
    officialAcquisition.value;


  const storedRaceNumbers =
    storedRaceRows
      .map(
        row =>
          Number(
            row.race_number
          )
      )
      .sort(
        (a, b) =>
          a - b
      );


  const officialRaceNumbers =
    official.races
      .map(
        race =>
          Number(
            race.raceNumber
          )
      )
      .sort(
        (a, b) =>
          a - b
      );


  const raceIdentityMatch =
    JSON.stringify(
      storedRaceNumbers
    ) ===
    JSON.stringify(
      officialRaceNumbers
    );


  const frozenIdentity =
    frozenRows
      .map(
        row => ({
          raceNumber:
            Number(
              row.race_number
            ),

          horseNumber:
            Number(
              row.horse_number
            ),

          horseName:
            normalizeHorseName(
              String(
                row.horse_name ??
                ""
              )
            ),

          finishPosition:
            row.finish_position == null
              ? null
              : Number(
                  row.finish_position
                )
        })
      )
      .sort(
        (a, b) =>
          a.raceNumber -
            b.raceNumber ||
          a.horseNumber -
            b.horseNumber
      );


  const officialIdentity =
    official.races
      .flatMap(
        race =>
          race.runners.map(
            runner => ({
              raceNumber:
                Number(
                  race.raceNumber
                ),

              horseNumber:
                Number(
                  runner.horseNumber
                ),

              horseName:
                normalizeHorseName(
                  runner.horseName
                ),

              finishPosition:
                Number(
                  runner.finishPosition
                )
            })
          )
      )
      .sort(
        (a, b) =>
          a.raceNumber -
            b.raceNumber ||
          a.horseNumber -
            b.horseNumber
      );


  const runnerIdentityMatch =
    frozenIdentity.length ===
      officialIdentity.length &&

    frozenIdentity.every(
      (frozenRunner, index) => {
        const officialRunner =
          officialIdentity[index];

        return (
          frozenRunner.raceNumber ===
            officialRunner.raceNumber &&

          frozenRunner.horseNumber ===
            officialRunner.horseNumber &&

          frozenRunner.horseName ===
            officialRunner.horseName
        );
      }
    );


  /*
   * Important for already-labelled historical data.
   *
   * If an existing label is present, it must agree
   * with the official target-date result.
   */
  const existingLabelsMatch =
    frozenIdentity.every(
      (frozenRunner, index) => {
        if (
          frozenRunner.finishPosition ==
          null
        ) {
          return true;
        }

        const officialRunner =
          officialIdentity[index];

        return (
          officialRunner != null &&
          frozenRunner.finishPosition ===
            officialRunner.finishPosition
        );
      }
    );


  const identityMatch =
    raceIdentityMatch &&
    runnerIdentityMatch &&
    existingLabelsMatch;


  const common = {
    storedDate,
    targetDate,
    city,

    acquisitionMethod:
      officialAcquisition.method,

    storedRaceCount:
      storedRaceNumbers.length,

    officialRaceCount:
      officialRaceNumbers.length,

    storedRunnerCount:
      frozenIdentity.length,

    officialRunnerCount:
      officialIdentity.length,

    raceIdentityMatch,
    runnerIdentityMatch,
    existingLabelsMatch,

    identityMatch,
    collision: false
  };


  if (!identityMatch) {
    return {
      ...common,

      validated: false,
      repaired: false,

      action:
        "NEEDS_MANUAL_REVIEW"
    };
  }


  /*
   * Dry-run is DEFAULT.
   */
  if (!apply) {
    return {
      ...common,

      validated: true,
      repaired: false,

      action:
        "WOULD_REPAIR"
    };
  }


  /*
   * Copy new parent identities first.
   *
   * Frozen prediction values remain exactly unchanged.
   */
  const statements: D1PreparedStatement[] =
    [];


  for (
    const race of
    storedRaceRows
  ) {
    statements.push(
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

          ?,
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

        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
      `)
        .bind(
          targetDate,

          replaceDatePrefix(
            race.starts_at,
            targetDate
          ),

          storedDate,
          city,
          race.race_number
        )
    );
  }


  /*
   * Move every known learning identity.
   */
  statements.push(
    env.DB.prepare(`
      UPDATE learning_runner_features
      SET race_date = ?
      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        targetDate,
        storedDate,
        city
      )
  );


  statements.push(
    env.DB.prepare(`
      UPDATE learning_expert_picks
      SET race_date = ?
      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        targetDate,
        storedDate,
        city
      )
  );


  statements.push(
    env.DB.prepare(`
      UPDATE learning_snapshot_candidates

      SET
        race_date = ?,

        starts_at =
          CASE
            WHEN starts_at IS NULL
            THEN NULL

            ELSE
              ? ||
              substr(
                starts_at,
                11
              )
          END

      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        targetDate,
        targetDate,
        storedDate,
        city
      )
  );


  statements.push(
    env.DB.prepare(`
      UPDATE learning_label_audit
      SET race_date = ?
      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        targetDate,
        storedDate,
        city
      )
  );


  /*
   * Delete old parent only AFTER children moved.
   */
  statements.push(
    env.DB.prepare(`
      DELETE FROM learning_races
      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        storedDate,
        city
      )
  );


  /*
   * Old result acquisition state belongs to the
   * wrong identity. Remove only source identity.
   */
  statements.push(
    env.DB.prepare(`
      DELETE FROM official_result_runs
      WHERE
        race_date = ?
        AND city = ?
    `)
      .bind(
        storedDate,
        city
      )
  );


  /*
   * D1 batch executes these as one transactional batch.
   */
  const mutationResults =
    await env.DB.batch(
      statements
    );


  /*
   * After identity repair, use the EXISTING normal
   * official result pipeline. Never manufacture labels.
   */
  const labelled =
    await ingestOfficialResults(
      env,
      {
        raceDate:
          targetDate,

        city,

        url:
          buildOfficialResultsUrl(
            targetDate,
            city
          )
      }
    );


  return {
    ...common,

    validated: true,
    repaired: true,

    action:
      "REPAIRED",

    mutationStatements:
      mutationResults.length,

    labelledRaces:
      labelled.labelledRaces,

    labelledRunners:
      labelled.labelledRunners,

    skippedRaces:
      labelled.skippedRaces
  };
}


export async function repairHistoricalDates(
  env: Env,
  input: HistoricalDateRepairInput
): Promise<any> {
  const mappings =
    Array.isArray(
      input.mappings
    )
      ? input.mappings
      : [];


  if (
    mappings.length === 0
  ) {
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
   * Prevent duplicate source identities in one request.
   */
  const seen =
    new Set<string>();


  for (
    const mapping of
    mappings
  ) {
    const key =
      `${mapping.storedDate}|${mapping.city}`;

    if (seen.has(key)) {
      throw new Error(
        `DUPLICATE_REPAIR_SOURCE:${key}`
      );
    }

    seen.add(key);
  }


  const apply =
    input.apply === true;


  const meetings: any[] =
    [];


  for (
    const mapping of
    mappings
  ) {
    const result =
      await repairOne(
        env,
        mapping,
        apply
      );

    meetings.push(
      result
    );
  }


  const validatedMeetings =
    meetings.filter(
      item =>
        item.validated === true
    ).length;


  const repairedMeetings =
    meetings.filter(
      item =>
        item.repaired === true
    ).length;


  const rejectedMeetings =
    meetings.filter(
      item =>
        item.validated !== true &&
        item.action !==
          "ALREADY_REPAIRED"
    ).length;


  const alreadyRepairedMeetings =
    meetings.filter(
      item =>
        item.action ===
          "ALREADY_REPAIRED"
    ).length;


  const labelledRaces =
    meetings.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.labelledRaces ??
          0
        ),
      0
    );


  const labelledRunners =
    meetings.reduce(
      (
        total,
        item
      ) =>
        total +
        Number(
          item.labelledRunners ??
          0
        ),
      0
    );


  const pendingRaces =
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM learning_races
      WHERE labelled_at IS NULL
    `)
      .first<any>();


  const pendingRunners =
    await env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM learning_runner_features
      WHERE finish_position IS NULL
    `)
      .first<any>();


  return {
    ok:
      rejectedMeetings === 0,

    dryRun:
      !apply,

    summary: {
      attemptedMeetings:
        mappings.length,

      validatedMeetings,
      repairedMeetings,
      rejectedMeetings,
      alreadyRepairedMeetings,

      labelledRaces,
      labelledRunners,

      remainingPendingRaces:
        Number(
          pendingRaces?.count ??
          0
        ),

      remainingPendingRunners:
        Number(
          pendingRunners?.count ??
          0
        )
    },

    meetings
  };
}
