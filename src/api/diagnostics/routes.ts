import type {
  Env
} from "../../env";

import {
  json,
  errorMessage,
  turkeyDate
} from "../../shared";

import {
  DIAGNOSTIC_ROUTES
} from "./catalog";

import {
  boundedLimit,
  databaseCounts,
  scalarCount,
  tableNames,
  validIdentifier
} from "./db";

import {
  SCORING_WEIGHTS,
  TOTAL_SCORING_WEIGHT
} from "../../scoring/weights";

import {
  summarizeExpertSourceHealth
} from "../../experts/source-repository";

import {
  buildRaceFieldCoverage
} from "./data-quality";

import {
  buildRaceFieldSignalCoverage
} from "../../field/coverage";

import {
  MODEL_VERSION,
  LEARNING_POLICY_VERSION,
  COUPON_POLICY_VERSION
} from "../../model/version";

import {
  SIXFOLD_STALE_AFTER_DAYS
} from "../../coupons/repository";

import {
  buildSixFoldCouponHealth
} from "./sixfold";

function integerParam(
  url: URL,
  name: string
): number | null {
  const value =
    Number(
      url.searchParams.get(name)
    );

  return Number.isInteger(value)
    ? value
    : null;
}


function parseJsonObject(
  value: unknown
): Record<string, any> | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(value);

    return (
      parsed &&
      typeof parsed ===
        "object" &&
      !Array.isArray(parsed)
    )
      ? parsed
      : null;
  } catch {
    return null;
  }
}



export async function routeDiagnostics(
  request: Request,
  env: Env
): Promise<Response | null> {
  const url =
    new URL(request.url);

  const path =
    url.pathname;

  if (
    path ===
    "/api/debug/routes"
  ) {
    return json({
      ok: true,
      count:
        DIAGNOSTIC_ROUTES.length,
      routes:
        DIAGNOSTIC_ROUTES
    });
  }

  if (
    path ===
    "/api/debug/config"
  ) {
    return json({
      ok: true,

      application: {
        name:
          env.APP_NAME,
        version:
          env.APP_VERSION
      },

      model: {
        scoring:
          MODEL_VERSION,
        learning:
          LEARNING_POLICY_VERSION,
        coupon:
          COUPON_POLICY_VERSION
      },

      security: {
        adminTokenConfigured:
          Boolean(
            env.ADMIN_TOKEN?.trim()
          )
      },

      logging: {
        level:
          env.LOG_LEVEL ??
          "info",
        debugSampleRate:
          env.LOG_DEBUG_SAMPLE_RATE ??
          "0.10"
      }
    });
  }

  if (
    path ===
    "/api/debug/scoring-config"
  ) {
    return json({
      ok: true,
      weights:
        SCORING_WEIGHTS,
      totalWeight:
        TOTAL_SCORING_WEIGHT,
      modelVersion:
        MODEL_VERSION,
      learningPolicyVersion:
        LEARNING_POLICY_VERSION,
      couponPolicyVersion:
        COUPON_POLICY_VERSION
    });
  }

  if (
    path ===
    "/api/debug/db/schema"
  ) {
    try {
      const result =
        await env.DB.prepare(`
          SELECT
            type,
            name,
            tbl_name,
            sql
          FROM sqlite_master
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY
            type,
            name
        `).all<any>();

      return json({
        ok: true,
        objects:
          result.results
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            errorMessage(error)
        },
        500
      );
    }
  }

  if (
    path ===
    "/api/debug/db/counts"
  ) {
    return json({
      ok: true,
      counts:
        await databaseCounts(env)
    });
  }

  if (
    path ===
    "/api/debug/table"
  ) {
    const name =
      String(
        url.searchParams.get(
          "name"
        ) ??
        ""
      );

    if (!validIdentifier(name)) {
      return json(
        {
          ok: false,
          error:
            "VALID_TABLE_NAME_REQUIRED"
        },
        400
      );
    }

    const allowed =
      await tableNames(env);

    if (!allowed.includes(name)) {
      return json(
        {
          ok: false,
          error:
            "TABLE_NOT_FOUND",
          tables:
            allowed
        },
        404
      );
    }

    const limit =
      boundedLimit(
        url.searchParams.get(
          "limit"
        )
      );

    const rows =
      await env.DB.prepare(
        'SELECT * FROM "' +
        name +
        '" LIMIT ?'
      )
        .bind(limit)
        .all<any>();

    return json({
      ok: true,
      table:
        name,
      limit,
      rows:
        rows.results
    });
  }

  if (
    path ===
    "/api/debug/card"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const races =
      await env.DB.prepare(`
        SELECT
          city,
          COUNT(*) race_count,
          MIN(race_number) first_race,
          MAX(race_number) last_race,
          MIN(starts_at) first_start,
          MAX(starts_at) last_start
        FROM races
        WHERE race_date = ?
        GROUP BY city
        ORDER BY city
      `)
        .bind(date)
        .all<any>();

    const runners =
      await env.DB.prepare(`
        SELECT
          city,
          COUNT(*) runner_count
        FROM runners
        WHERE race_date = ?
        GROUP BY city
        ORDER BY city
      `)
        .bind(date)
        .all<any>();

    return json({
      ok: true,
      date,
      races:
        races.results,
      runners:
        runners.results
    });
  }

  if (
    path ===
    "/api/debug/race"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const city =
      String(
        url.searchParams.get(
          "city"
        ) ??
        ""
      );

    const race =
      integerParam(
        url,
        "race"
      );

    if (
      !city ||
      race == null
    ) {
      return json(
        {
          ok: false,
          error:
            "CITY_AND_RACE_REQUIRED"
        },
        400
      );
    }

    const raceRow =
      await env.DB.prepare(`
        SELECT *
        FROM races
        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
      `)
        .bind(
          date,
          city,
          race
        )
        .first<any>();

    const runners =
      await env.DB.prepare(`
        SELECT *
        FROM runners
        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
        ORDER BY horse_number
      `)
        .bind(
          date,
          city,
          race
        )
        .all<any>();

    return json({
      ok:
        raceRow != null,
      date,
      city,
      raceNumber:
        race,
      race:
        raceRow ??
        null,
      runners:
        runners.results
    });
  }

  if (
    path ===
    "/api/debug/runner"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const city =
      String(
        url.searchParams.get(
          "city"
        ) ??
        ""
      );

    const race =
      integerParam(
        url,
        "race"
      );

    const horse =
      integerParam(
        url,
        "horse"
      );

    if (
      !city ||
      race == null ||
      horse == null
    ) {
      return json(
        {
          ok: false,
          error:
            "CITY_RACE_HORSE_REQUIRED"
        },
        400
      );
    }

    const runner =
      await env.DB.prepare(`
        SELECT *
        FROM runners
        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
          AND horse_number = ?
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .first<any>();

    const experts =
      await env.DB.prepare(`
        SELECT *
        FROM expert_predictions
        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
          AND horse_number = ?
        ORDER BY source_key
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .all<any>();

    const market =
      await env.DB.prepare(`
        SELECT *
        FROM agf_market_snapshots
        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
          AND horse_number = ?
        ORDER BY captured_at DESC
        LIMIT 30
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .all<any>();

    const field =
      await env.DB.prepare(`
        SELECT *
        FROM field_signals
        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?
          AND horse_number = ?
      `)
        .bind(
          date,
          city,
          race,
          horse
        )
        .all<any>();

    return json({
      ok:
        runner != null,
      identity: {
        date,
        city,
        race,
        horse
      },
      runner:
        runner ??
        null,
      experts:
        experts.results,
      market:
        market.results,
      field:
        field.results
    });
  }

  if (
    path ===
    "/api/debug/data-quality"
  ) {
    const date =
      url.searchParams.get(
        "date"
      ) ??
      turkeyDate();

    const runners =
      await env.DB.prepare(`
        SELECT
          city,
          COUNT(*) runners,

          SUM(
            CASE
              WHEN agf_percent IS NULL
              THEN 1 ELSE 0
            END
          ) missing_agf,

          SUM(
            CASE
              WHEN recent_form_raw IS NULL
                OR TRIM(recent_form_raw) = ''
              THEN 1 ELSE 0
            END
          ) missing_form,

          SUM(
            CASE
              WHEN hp IS NULL
              THEN 1 ELSE 0
            END
          ) missing_hp,

          SUM(
            CASE
              WHEN weight IS NULL
              THEN 1 ELSE 0
            END
          ) missing_weight

        FROM runners
        WHERE race_date = ?
        GROUP BY city
        ORDER BY city
      `)
        .bind(date)
        .all<any>();

    const expertRows =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM expert_predictions
          WHERE race_date = ?
        `,
        date
      );

    const marketRows =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM agf_market_snapshots
          WHERE race_date = ?
        `,
        date
      );

    const fieldRows =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM field_signals
          WHERE
            race_date = ?
            AND tjk_score IS NOT NULL
        `,
        date
      );

    const perRace =
      await env.DB.prepare(`
        SELECT
          city,
          race_number,
          COUNT(*) total_runners,

          SUM(
            CASE
              WHEN recent_form_raw IS NULL
                OR TRIM(recent_form_raw) = ''
              THEN 1 ELSE 0
            END
          ) missing_form,

          SUM(
            CASE
              WHEN hp IS NULL
              THEN 1 ELSE 0
            END
          ) missing_hp,

          /*
           * TJK does not assign a handicap rating until a horse
           * has run enough races. A runner missing HP whose own
           * recent_form_raw shows at most one or two prior starts
           * is explained by that, same as a full debut field —
           * only a longer form history with no HP is unexplained.
           */
          SUM(
            CASE
              WHEN hp IS NULL
                AND recent_form_raw IS NOT NULL
                AND LENGTH(TRIM(recent_form_raw)) > 2
              THEN 1 ELSE 0
            END
          ) unexplained_missing_hp

        FROM runners
        WHERE race_date = ?
        GROUP BY city, race_number
        ORDER BY city, race_number
      `)
        .bind(date)
        .all<any>();

    const raceFieldCoverage =
      buildRaceFieldCoverage(
        perRace.results ?? []
      );

    const perRaceFieldSignal =
      await env.DB.prepare(`
        SELECT
          r.city,
          r.race_number,
          COUNT(*) total_runners,

          SUM(
            CASE
              WHEN fs.tjk_score IS NOT NULL
              THEN 1 ELSE 0
            END
          ) covered_runners

        FROM runners r
        LEFT JOIN field_signals fs
          ON fs.race_date = r.race_date
          AND fs.city = r.city
          AND fs.race_number = r.race_number
          AND fs.horse_number = r.horse_number
        WHERE r.race_date = ?
        GROUP BY r.city, r.race_number
        ORDER BY r.city, r.race_number
      `)
        .bind(date)
        .all<any>();

    const fieldSignalCoverage =
      buildRaceFieldSignalCoverage(
        perRaceFieldSignal.results ?? []
      );

    /*
     * partial-data races are exactly the ones where scoring
     * suppresses field_score race-wide (Part 9) -- surfaced here so
     * an operator can see why, rather than only seeing the effect
     * downstream in a race's model scores.
     */
    const partialFieldCoverageRaces =
      fieldSignalCoverage.filter(
        race =>
          race.coverageState ===
          "partial-data"
      );

    /*
     * A "likely-not-published" whole race (every runner missing
     * together — the debut/maiden-field signature) is expected and
     * not alarmed on. A form gap only has that one benign
     * explanation, so partial-gap is always real for form. HP has a
     * second benign explanation (insufficient own race history),
     * so its alarm gates on unexplainedMissingHp rather than the
     * raw count.
     */
    const formGaps =
      raceFieldCoverage.filter(
        race =>
          race.formCoverage ===
          "partial-gap"
      );

    const hpGaps =
      raceFieldCoverage.filter(
        race =>
          race.unexplainedMissingHp >
          0
      );

    return json({
      ok:
        formGaps.length === 0 &&
        hpGaps.length === 0,

      date,
      byCity:
        runners.results,
      signalRows: {
        experts:
          expertRows,
        market:
          marketRows,
        field:
          fieldRows
      },

      raceFieldCoverage,
      fieldSignalCoverage,
      partialFieldCoverageRaces,

      unexplainedGaps: {
        form: formGaps,
        hp: hpGaps
      }
    });
  }

  if (
    path ===
    "/api/debug/date-contract"
  ) {
    try {
      const meetings =
        await env.DB.prepare(`
          SELECT
            race_date,
            city,
            COUNT(*) AS row_count,
            MAX(updated_at) AS latest_update
          FROM meetings
          GROUP BY
            race_date,
            city
          ORDER BY
            race_date DESC,
            city
        `)
          .all<any>();

      const races =
        await env.DB.prepare(`
          SELECT
            race_date,
            city,
            COUNT(*) AS race_count,
            MIN(race_number) AS first_race,
            MAX(race_number) AS last_race,
            MIN(starts_at) AS first_start,
            MAX(starts_at) AS last_start,
            SUM(
              CASE
                WHEN substr(starts_at, 1, 10) != race_date
                THEN 1
                ELSE 0
              END
            ) AS starts_at_date_mismatch
          FROM races
          GROUP BY
            race_date,
            city
          ORDER BY
            race_date DESC,
            city
        `)
          .all<any>();

      const candidates =
        await env.DB.prepare(`
          SELECT
            race_date,
            city,
            COUNT(*) AS candidate_count,
            MIN(starts_at) AS first_start,
            MAX(starts_at) AS last_start,
            MIN(captured_at) AS first_capture,
            MAX(captured_at) AS last_capture,
            SUM(
              CASE
                WHEN substr(starts_at, 1, 10) != race_date
                THEN 1
                ELSE 0
              END
            ) AS starts_at_date_mismatch,
            SUM(
              CASE
                WHEN captured_at >= starts_at
                THEN 1
                ELSE 0
              END
            ) AS invalid_capture_timing
          FROM learning_snapshot_candidates
          GROUP BY
            race_date,
            city
          ORDER BY
            race_date DESC,
            city
        `)
          .all<any>();

      const learning =
        await env.DB.prepare(`
          SELECT
            race_date,
            city,
            COUNT(*) AS race_count,
            SUM(
              CASE
                WHEN labelled_at IS NOT NULL
                THEN 1
                ELSE 0
              END
            ) AS labelled_races,
            SUM(
              CASE
                WHEN labelled_at IS NULL
                THEN 1
                ELSE 0
              END
            ) AS pending_races,
            MIN(starts_at) AS first_start,
            MAX(starts_at) AS last_start,
            MIN(snapshot_at) AS first_snapshot,
            MAX(snapshot_at) AS last_snapshot,
            SUM(
              CASE
                WHEN substr(starts_at, 1, 10) != race_date
                THEN 1
                ELSE 0
              END
            ) AS starts_at_date_mismatch
          FROM learning_races
          GROUP BY
            race_date,
            city
          ORDER BY
            race_date DESC,
            city
        `)
          .all<any>();

      const identities =
        await env.DB.prepare(`
          SELECT race_date, city
          FROM meetings

          UNION

          SELECT race_date, city
          FROM races

          UNION

          SELECT race_date, city
          FROM learning_snapshot_candidates

          UNION

          SELECT race_date, city
          FROM learning_races

          ORDER BY
            race_date DESC,
            city
        `)
          .all<any>();

      const meetingMap =
        new Map(
          (meetings.results ?? [])
            .map(
              row => [
                `${row.race_date}|${row.city}`,
                row
              ]
            )
        );

      const raceMap =
        new Map(
          (races.results ?? [])
            .map(
              row => [
                `${row.race_date}|${row.city}`,
                row
              ]
            )
        );

      const candidateMap =
        new Map(
          (candidates.results ?? [])
            .map(
              row => [
                `${row.race_date}|${row.city}`,
                row
              ]
            )
        );

      const learningMap =
        new Map(
          (learning.results ?? [])
            .map(
              row => [
                `${row.race_date}|${row.city}`,
                row
              ]
            )
        );

      const chain =
        (identities.results ?? [])
          .map(
            identity => {
              const key =
                `${identity.race_date}|${identity.city}`;

              const meeting =
                meetingMap.get(key);

              const race =
                raceMap.get(key);

              const candidate =
                candidateMap.get(key);

              const learningRow =
                learningMap.get(key);

              const anomalies:
                string[] = [];

              if (
                race &&
                Number(
                  race.starts_at_date_mismatch ?? 0
                ) > 0
              ) {
                anomalies.push(
                  "RACE_DATE_STARTS_AT_MISMATCH"
                );
              }

              if (
                candidate &&
                Number(
                  candidate.starts_at_date_mismatch ?? 0
                ) > 0
              ) {
                anomalies.push(
                  "CANDIDATE_DATE_STARTS_AT_MISMATCH"
                );
              }

              if (
                candidate &&
                Number(
                  candidate.invalid_capture_timing ?? 0
                ) > 0
              ) {
                anomalies.push(
                  "CANDIDATE_CAPTURE_AFTER_START"
                );
              }

              if (
                learningRow &&
                Number(
                  learningRow.starts_at_date_mismatch ?? 0
                ) > 0
              ) {
                anomalies.push(
                  "LEARNING_DATE_STARTS_AT_MISMATCH"
                );
              }

              return {
                raceDate:
                  identity.race_date,

                city:
                  identity.city,

                layers: {
                  meeting:
                    meeting ?? null,

                  races:
                    race ?? null,

                  candidates:
                    candidate ?? null,

                  learning:
                    learningRow ?? null
                },

                anomalies
              };
            }
          );

      const anomalous =
        chain.filter(
          item =>
            item.anomalies.length > 0
        );

      return json({
        ok:
          anomalous.length === 0,

        summary: {
          identities:
            chain.length,

          anomalousIdentities:
            anomalous.length,

          meetingGroups:
            meetings.results?.length ?? 0,

          raceGroups:
            races.results?.length ?? 0,

          candidateGroups:
            candidates.results?.length ?? 0,

          learningGroups:
            learning.results?.length ?? 0
        },

        anomalous,
        chain
      });
    } catch (error) {
      return json(
        {
          ok: false,
          error:
            errorMessage(error)
        },
        500
      );
    }
  }


  if (
    path ===
    "/api/debug/invariants"
  ) {
    const invalidCaptureTiming =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM learning_snapshot_candidates
          WHERE captured_at >= starts_at
        `
      );

    const orphanRunners =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM runners r
          LEFT JOIN races rc
            ON rc.race_date = r.race_date
           AND rc.city = r.city
           AND rc.race_number = r.race_number
          WHERE rc.race_number IS NULL
        `
      );

    const duplicateWindows =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM (
            SELECT
              race_date,
              city,
              sixfold_number
            FROM sixfold_windows
            GROUP BY
              race_date,
              city,
              sixfold_number
            HAVING COUNT(*) > 1
          )
        `
      );

    const duplicateSnapshotKeys =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM (
            SELECT snapshot_key
            FROM sixfold_coupon_snapshots
            WHERE snapshot_key IS NOT NULL
            GROUP BY snapshot_key
            HAVING COUNT(*) > 1
          )
        `
      );

    const checks = {
      invalidCaptureTiming,
      orphanRunners,
      duplicateWindows,
      duplicateSnapshotKeys
    };

    return json({
      ok:
        Object.values(checks)
          .every(
            value =>
              value === 0
          ),
      checks
    });
  }

  if (
    path ===
    "/api/debug/results"
  ) {
    const limit =
      boundedLimit(
        url.searchParams.get(
          "limit"
        )
      );

    const rows =
      await env.DB.prepare(`
        SELECT
          race_date,
          city,
          last_attempt_at,
          last_success_at,
          method,
          status,
          detail

        FROM official_result_runs

        ORDER BY
          last_attempt_at DESC

        LIMIT ?
      `)
        .bind(limit)
        .all<any>();

    const stageNames = [
      "acquisition",
      "learningLabel",
      "priorRebuild",
      "learningEvaluation",
      "expertPriorRebuild",
      "advancedEvaluation",
      "couponEvaluation"
    ] as const;

    const stageSummary:
      Record<
        string,
        {
          ok: number;
          error: number;
          skipped: number;
          unknown: number;
        }
      > = {};

    for (
      const stageName of
      stageNames
    ) {
      stageSummary[
        stageName
      ] = {
        ok: 0,
        error: 0,
        skipped: 0,
        unknown: 0
      };
    }

    let ok = 0;
    let okWithWarnings = 0;
    let error = 0;
    let unknownStatus = 0;

    const runs =
      (rows.results ?? [])
        .map(
          row => {
            const detail =
              parseJsonObject(
                row.detail
              );

            const stages =
              detail &&
              typeof detail.stages ===
                "object" &&
              detail.stages != null
                ? detail.stages
                : null;

            if (
              row.status ===
              "ok"
            ) {
              ok += 1;
            } else if (
              row.status ===
              "ok_with_warnings"
            ) {
              okWithWarnings += 1;
            } else if (
              row.status ===
              "error"
            ) {
              error += 1;
            } else {
              unknownStatus += 1;
            }

            const stageView:
              Record<
                string,
                {
                  status: string;
                  error: string | null;
                }
              > = {};

            for (
              const stageName of
              stageNames
            ) {
              const stage =
                stages?.[
                  stageName
                ];

              const status =
                typeof stage?.status ===
                  "string"
                  ? stage.status
                  : "unknown";

              const stageError =
                typeof stage?.error ===
                  "string"
                  ? stage.error
                  : null;

              stageView[
                stageName
              ] = {
                status,
                error:
                  stageError
              };

              const summary =
                stageSummary[
                  stageName
                ];

              if (
                status ===
                "ok"
              ) {
                summary.ok += 1;
              } else if (
                status ===
                "error"
              ) {
                summary.error += 1;
              } else if (
                status ===
                "skipped"
              ) {
                summary.skipped += 1;
              } else {
                summary.unknown += 1;
              }
            }

            return {
              raceDate:
                row.race_date,

              city:
                row.city,

              lastAttemptAt:
                row.last_attempt_at,

              lastSuccessAt:
                row.last_success_at,

              method:
                row.method,

              status:
                row.status,

              raceCount:
                detail?.raceCount ??
                null,

              labelledRaces:
                detail?.labelledRaces ??
                null,

              labelledRunners:
                detail?.labelledRunners ??
                null,

              skippedRaces:
                detail?.skippedRaces ??
                null,

              error:
                typeof detail?.error ===
                  "string"
                  ? detail.error
                  : (
                      row.status ===
                        "error" &&
                      typeof row.detail ===
                        "string" &&
                      !detail
                        ? row.detail
                        : null
                    ),

              stages:
                stageView
            };
          }
        );

    const failingStages =
      Object.entries(
        stageSummary
      )
        .filter(
          ([, summary]) =>
            summary.error > 0
        )
        .map(
          ([stage, summary]) => ({
            stage,
            errors:
              summary.error
          })
        );

    return json({
      ok:
        error === 0 &&
        failingStages.length === 0,

      summary: {
        total:
          runs.length,

        ok,

        okWithWarnings,

        error,

        unknownStatus
      },

      failingStages,

      stageSummary,

      runs
    });
  }


  if (
    path ===
    "/api/debug/pipeline"
  ) {
    const refresh =
      await env.DB.prepare(`
        SELECT *
        FROM refresh_state
        ORDER BY pipeline_key
      `).all<any>();

    const sources =
      await env.DB.prepare(`
        SELECT
          enabled,
          health_status,
          COUNT(*) total
        FROM source_registry
        GROUP BY
          enabled,
          health_status
        ORDER BY
          enabled DESC,
          health_status
      `).all<any>();

    const learning =
      await env.DB.prepare(`
        SELECT
          COUNT(*) candidate_count,
          SUM(
            CASE
              WHEN captured_at >= starts_at
              THEN 1 ELSE 0
            END
          ) invalid_capture_timing,
          MAX(captured_at) latest_capture
        FROM learning_snapshot_candidates
      `).first<any>();

    const coupons =
      await env.DB.prepare(`
        SELECT
          COUNT(*) total,
          SUM(
            CASE
              WHEN evaluated_at IS NULL
              THEN 1 ELSE 0
            END
          ) pending,
          MAX(generated_at) latest_generation
        FROM sixfold_coupon_snapshots
      `).first<any>();

    const sixfoldHealthRow =
      await env.DB.prepare(`
        SELECT
          COUNT(*) total,

          SUM(
            CASE
              WHEN evaluated_at IS NOT NULL
              THEN 1 ELSE 0
            END
          ) evaluated,

          SUM(
            CASE
              WHEN evaluated_at IS NULL
                AND unresolved_reason IS NULL
              THEN 1 ELSE 0
            END
          ) pending,

          SUM(
            CASE
              WHEN unresolved_reason IS NOT NULL
              THEN 1 ELSE 0
            END
          ) unresolved,

          SUM(
            CASE
              WHEN evaluated_at IS NULL
                AND unresolved_reason IS NULL
                AND race_date < date('now', ?)
              THEN 1 ELSE 0
            END
          ) overdue_unclassified

        FROM sixfold_coupon_snapshots
      `)
        .bind(
          `-${SIXFOLD_STALE_AFTER_DAYS} days`
        )
        .first<any>();

    const sixfoldCouponHealth =
      buildSixFoldCouponHealth(
        sixfoldHealthRow ?? {}
      );

    const sixfoldCalibration =
      await env.DB.prepare(`
        SELECT
          sample_count,
          predicted_avg_coverage,
          actual_hit_rate,
          temperature,
          status,
          updated_at
        FROM sixfold_probability_calibration
        WHERE id = 1
      `).first<any>();

    const fivefoldCalibration =
      await env.DB.prepare(`
        SELECT
          sample_count,
          predicted_avg_coverage,
          actual_hit_rate,
          temperature,
          status,
          updated_at
        FROM fivefold_probability_calibration
        WHERE id = 1
      `).first<any>();

    const officialResults =
      await env.DB.prepare(`
        SELECT
          COUNT(*) total,

          SUM(
            CASE
              WHEN status = 'ok'
              THEN 1 ELSE 0
            END
          ) ok,

          SUM(
            CASE
              WHEN status = 'ok_with_warnings'
              THEN 1 ELSE 0
            END
          ) warnings,

          SUM(
            CASE
              WHEN status = 'error'
              THEN 1 ELSE 0
            END
          ) errors,

          MAX(last_attempt_at)
            latest_attempt,

          MAX(last_success_at)
            latest_success

        FROM official_result_runs
      `).first<any>();

    const recentResultRuns =
      await env.DB.prepare(`
        SELECT
          race_date,
          city,
          status,
          detail,
          last_attempt_at

        FROM official_result_runs

        ORDER BY
          last_attempt_at DESC

        LIMIT 20
      `).all<any>();

    const stageErrors:
      {
        raceDate: string;
        city: string;
        stage: string;
        error: string;
        lastAttemptAt: string | null;
      }[] = [];

    for (
      const row of
      recentResultRuns.results ?? []
    ) {
      const detail =
        parseJsonObject(
          row.detail
        );

      const stages =
        detail &&
        typeof detail.stages ===
          "object" &&
        detail.stages != null
          ? detail.stages
          : null;

      if (!stages) {
        continue;
      }

      for (
        const [
          stageName,
          stageValue
        ] of Object.entries(
          stages
        )
      ) {
        const stage =
          stageValue as
            Record<string, any>;

        if (
          stage?.status !==
          "error"
        ) {
          continue;
        }

        stageErrors.push({
          raceDate:
            String(
              row.race_date
            ),

          city:
            String(
              row.city
            ),

          stage:
            stageName,

          error:
            typeof stage.error ===
              "string"
              ? stage.error
              : "UNKNOWN_STAGE_ERROR",

          lastAttemptAt:
            row.last_attempt_at ??
            null
        });
      }
    }

    return json({
      ok: true,
      serverNow:
        new Date()
          .toISOString(),
      refreshState:
        refresh.results,
      sourceSummary:
        sources.results,
      learning,
      coupons,
      sixfoldCouponHealth,
      sixfoldCalibration:
        sixfoldCalibration ?? null,

      fivefoldCalibration:
        fivefoldCalibration ?? null,

      officialResults,

      officialResultStageErrors:
        stageErrors
    });
  }

  if (
    path ===
    "/api/debug/health/deep"
  ) {
    try {
      await env.DB.prepare(
        "SELECT 1"
      ).first();

      const invalidCaptureTiming =
        await scalarCount(
          env,
          `
            SELECT COUNT(*) total
            FROM learning_snapshot_candidates
            WHERE captured_at >= starts_at
          `
        );

      const sourceHealth =
        await summarizeExpertSourceHealth(
          env
        );

      return json({
        ok: true,
        status:
          invalidCaptureTiming > 0
            ? "degraded"
            : "healthy",
        database:
          "healthy",
        invalidCaptureTiming,

        /*
         * Kept for backward compatibility: previously counted any
         * source not exactly "healthy", which conflated a genuine
         * failure with a source that simply had no card today and
         * with a source that succeeded days ago and was never
         * rechecked. Now only real failures (degraded/blocked/
         * parse-error, including stale-healthy) count here.
         */
        degradedSources:
          sourceHealth.failedSources +
          sourceHealth.staleSources,

        expertSources:
          sourceHealth,

        serverNow:
          new Date()
            .toISOString()
      });
    } catch (error) {
      return json(
        {
          ok: false,
          status:
            "unhealthy",
          error:
            errorMessage(error)
        },
        500
      );
    }
  }

  if (
    path ===
    "/api/debug/overview"
  ) {
    const date =
      turkeyDate();

    const raceCount =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM races
          WHERE race_date = ?
        `,
        date
      );

    const runnerCount =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM runners
          WHERE race_date = ?
        `,
        date
      );

    const sourceCount =
      await scalarCount(
        env,
        `
          SELECT COUNT(*) total
          FROM source_registry
          WHERE enabled = 1
        `
      );

    return json({
      ok: true,
      date,
      raceCount,
      runnerCount,
      enabledSources:
        sourceCount,
      diagnostics:
        DIAGNOSTIC_ROUTES
    });
  }

  return null;
}
