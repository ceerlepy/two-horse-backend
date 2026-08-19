import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";
import { turkeyDate, turkeyDateTime } from "../shared";
import { aggregateExpertPredictions } from "../experts/aggregator";
import { scoreRace, raceUncertainty } from "../scoring/race-score";

import {
  getTodayMarketSnapshots,
  marketRunnerKey
} from "../market/repository";

import {
  analyzeMarketMovement
} from "../market/market-score";

import {
  scoreExpertFieldComments
} from "../field/expert-field-score";

import {
  combineFieldScores
} from "../field/combined-field-score";

import {
  horseIdentity,
  jockeyIdentity,
  distanceBand
} from "../learning/identity";

import {
  applyLearningAdjustment,
  type ContextPrior,
  type GlobalOutcomeRates
} from "../learning/adjustment";

import {
  expertCategory
} from "../learning/expert-category";

import {
  recommendCouponStrategy
} from "../coupon/strategy";

export async function upsertProgram(env: Env, program: TjkProgramInput, sourceHash: string): Promise<void> {
  const date = turkeyDate();
  const statements: D1PreparedStatement[] = [];
  for (const meeting of program.meetings) {
    statements.push(env.DB.prepare(`INSERT INTO meetings(race_date,city,source_hash,updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(race_date,city) DO UPDATE SET source_hash=excluded.source_hash,updated_at=CURRENT_TIMESTAMP`)
      .bind(date, meeting.city, sourceHash));
    for (const race of meeting.races) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(race.time ?? "")) {
          throw new Error(`Refusing incomplete race: ${meeting.city} R${race.raceNumber} invalid time`);
        }
        if (!race.runners?.length) {
          throw new Error(`Refusing incomplete race: ${meeting.city} R${race.raceNumber} no runners`);
        }
        const startsAtDate = turkeyDateTime(date, race.time);
        if (!startsAtDate) {
          throw new Error(`Unable to build starts_at: ${meeting.city} R${race.raceNumber}`);
        }
        const startsAt = startsAtDate.toISOString();
      statements.push(env.DB.prepare(`INSERT INTO races(
        race_date,
        city,
        race_number,
        start_time,
        starts_at,
        distance_meters,
        track,
        performance_url,
        updated_at
      )
        VALUES(
          ?,?,?,?,?,?,?,?,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT(
          race_date,
          city,
          race_number
        )
        DO UPDATE SET
          start_time=excluded.start_time,
          starts_at=excluded.starts_at,
          distance_meters=excluded.distance_meters,
          track=excluded.track,
          performance_url=excluded.performance_url,
          updated_at=CURRENT_TIMESTAMP`)
        .bind(
          date,
          meeting.city,
          race.raceNumber,
          race.time,
          startsAt,
          race.distanceMeters,
          race.track,
          race.performanceUrl ?? null
        ));
      for (const r of race.runners) {
        statements.push(env.DB.prepare(`INSERT INTO runners(
            race_date,
            city,
            race_number,
            horse_number,
            horse_name,
            jockey,
            weight,
            hp,
            agf_percent,
            recent_form_raw,
            horse_profile_url,
            horse_id,
            jockey_id,
            jockey_profile_url,
            updated_at
          )
          VALUES(
            ?,?,?,?,?,?,?,?,?,?,?,?,?,?,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT(
            race_date,
            city,
            race_number,
            horse_number
          )
          DO UPDATE SET
            horse_name=excluded.horse_name,
            jockey=excluded.jockey,
            weight=excluded.weight,
            hp=excluded.hp,
            agf_percent=excluded.agf_percent,
            recent_form_raw=excluded.recent_form_raw,
            horse_profile_url=excluded.horse_profile_url,
            horse_id=excluded.horse_id,
            jockey_id=excluded.jockey_id,
            jockey_profile_url=excluded.jockey_profile_url,
            updated_at=CURRENT_TIMESTAMP`)
          .bind(
            date,
            meeting.city,
            race.raceNumber,
            r.number,
            r.name,
            r.jockey,
            r.weight,
            r.hp,
            r.agfPercent,
            r.recentFormRaw,
            r.horseProfileUrl,

            horseIdentity(
              r.name,
              r.horseProfileUrl
            ),

            jockeyIdentity(
              r.jockey,
              r.jockeyProfileUrl
            ),

            r.jockeyProfileUrl
          ));
      }
    }
  }
  // D1 batch has practical statement limits; chunk to keep requests predictable.
  for (let i=0; i<statements.length; i+=75) await env.DB.batch(statements.slice(i, i+75));
}

export async function getToday(env: Env): Promise<any> {
  const date = turkeyDate();
  const meetings = await env.DB.prepare("SELECT city,updated_at FROM meetings WHERE race_date=? ORDER BY city").bind(date).all<any>();
  const races = await env.DB.prepare("SELECT * FROM races WHERE race_date=? ORDER BY city,race_number").bind(date).all<any>();
  const runners = await env.DB.prepare("SELECT * FROM runners WHERE race_date=? ORDER BY city,race_number,horse_number").bind(date).all<any>();
  const marketSnapshots =
    await getTodayMarketSnapshots(
      env
    );

  const fieldSignals =
    await env.DB.prepare(`
      SELECT
        city,
        race_number,
        horse_number,
        tjk_score,
        sample_size
      FROM field_signals
      WHERE race_date = ?
    `)
      .bind(date)
      .all<any>();

  const globalOutcome =
    await env.DB.prepare(`
      SELECT
        AVG(
          CASE
            WHEN finish_position = 1
              THEN 1.0
            ELSE 0.0
          END
        ) AS win_rate,

        AVG(
          CASE
            WHEN finish_position
              BETWEEN 1 AND 3
              THEN 1.0
            ELSE 0.0
          END
        ) AS top3_rate

      FROM learning_runner_features

      WHERE finish_position
        IS NOT NULL
    `)
      .first<any>();

  const globalRates:
    GlobalOutcomeRates = {
      winRate:
        Number(
          globalOutcome?.win_rate ??
          0
        ),

      top3Rate:
        Number(
          globalOutcome?.top3_rate ??
          0
        )
    };

  const learningState =
    await env.DB.prepare(`
      SELECT
        learning_scale
      FROM learning_model_state
      WHERE id = 1
    `)
      .first<any>();

  const learningScale =
    Math.max(
      0,
      Math.min(
        1,
        Number(
          learningState
            ?.learning_scale ??
          1
        )
      )
    );

  const contextPriors =
    await env.DB.prepare(`
      SELECT *
      FROM learning_context_priors
    `).all<any>();

  const expertPriors =
    await env.DB.prepare(`
      SELECT
        source_key,
        multiplier
      FROM expert_learning_priors
    `).all<any>();

  const expertMultiplier =
    new Map<string, number>(
      (
        expertPriors.results ??
        []
      ).map(
        (row:any) => [
          String(row.source_key),
          Number(row.multiplier ?? 1)
        ]
      )
    );

  const expertCategoryPriors =
    await env.DB.prepare(`
      SELECT
        source_key,
        category,
        multiplier
      FROM expert_category_priors
    `)
      .all<any>();

  const expertCategoryMultiplier =
    new Map<string, number>(
      (
        expertCategoryPriors
          .results ??
        []
      ).map(
        (row:any) => [
          `${
            String(
              row.source_key
            )
          }|${
            String(
              row.category
            )
          }`,

          Number(
            row.multiplier ??
            1
          )
        ]
      )
    );

  const experts = await env.DB.prepare(`
    SELECT
      ep.*,
      sr.source_type,
      sr.base_weight
    FROM expert_predictions ep
    LEFT JOIN source_registry sr
      ON sr.source_key = ep.source_key
    WHERE
      ep.race_date = ?
      AND COALESCE(
        sr.enabled,
        0
      ) = 1

    ORDER BY
      ep.city,
      ep.race_number,
      ep.source_key,
      ep.source_rank,
      ep.horse_number
  `).bind(date).all<any>();
  return (meetings.results ?? []).map((m:any) => {
    const meetingRaces =
      (races.results ?? [])
        .filter(
          (r:any) =>
            r.city === m.city
        );

    return {
      city: m.city,

      races:
        meetingRaces.map(
          (race:any) => {
            const raceExperts =
              (experts.results ?? [])
                .filter(
                  (e:any) =>
                    e.city === m.city &&
                    e.race_number ===
                      race.race_number
                );

            const assembledRunners =
              (runners.results ?? [])
                .filter(
                  (runner:any) =>
                    runner.city === m.city &&
                    runner.race_number ===
                      race.race_number
                )
                .map(
                  (runner:any) => {
                    const expertPredictions =
                      raceExperts
                        .filter(
                          (e:any) =>
                            e.horse_number ===
                              runner.horse_number
                        )
                        .map(
                          (e:any) => {
                            const category =
                              expertCategory(
                                e
                              );

                            const generalMultiplier =
                              expertMultiplier.get(
                                String(
                                  e.source_key
                                )
                              ) ??
                              1;

                            const categoryMultiplier =
                              category == null
                                ? 1
                                : (
                                    expertCategoryMultiplier
                                      .get(
                                        `${
                                          String(
                                            e.source_key
                                          )
                                        }|${
                                          category
                                        }`
                                      ) ??
                                    1
                                  );

                            return {
                              ...e,

                              /*
                               * Source calibration and
                               * category calibration affect
                               * only this expert source.
                               *
                               * Neither changes AGF/form/
                               * HP/market/field components.
                               */
                              base_weight:
                                Number(
                                  e.base_weight ??
                                  1
                                ) *
                                generalMultiplier *
                                categoryMultiplier,

                              learningCalibration: {
                                generalMultiplier,
                                category,
                                categoryMultiplier
                              }
                            };
                          }
                        );

                    const marketMovement =
                      analyzeMarketMovement(
                        marketSnapshots[
                          marketRunnerKey(
                            m.city,
                            race.race_number,
                            runner.horse_number
                          )
                        ] ?? [],
                        {
                          /*
                           * Only the final pre-race market
                           * window is allowed to affect score.
                           */
                          raceStartsAt:
                            race.starts_at,

                          windowMinutes:
                            90
                        }
                      );

                    const storedField =
                      (
                        fieldSignals.results ??
                        []
                      ).find(
                        (item:any) =>
                          item.city ===
                            m.city &&
                          item.race_number ===
                            race.race_number &&
                          item.horse_number ===
                            runner.horse_number
                      );

                    const expertFieldScore =
                      scoreExpertFieldComments(
                        expertPredictions.map(
                          (prediction:any) =>
                            prediction.comment
                        ),
                        race.track
                      );

                    const fieldSignal =
                      combineFieldScores(
                        storedField?.tjk_score == null
                          ? null
                          : Number(
                              storedField.tjk_score
                            ),

                        expertFieldScore
                      );

                    return {
                      ...runner,

                      marketMovement,

                      market_score:
                        marketMovement.score,

                      /*
                       * Diagnostics/UI.
                       */
                      fieldSignal: {
                        ...fieldSignal,

                        tjkSampleSize:
                          storedField?.sample_size == null
                            ? 0
                            : Number(
                                storedField.sample_size
                              )
                      },

                      /*
                       * Final model input.
                       */
                      field_score:
                        fieldSignal.score,

                      expertPredictions,

                      expertConsensus:
                        aggregateExpertPredictions(
                          expertPredictions
                        )
                    };
                  }
                );

            const baseScoredRunners =
              scoreRace(
                assembledRunners
              );

            const band =
              distanceBand(
                race.distance_meters
              );

            const priorFor = (
              entityType: string,
              entityKey:
                string | null
            ): ContextPrior | null => {
              if (!entityKey) {
                return null;
              }

              const row =
                (
                  contextPriors.results ??
                  []
                ).find(
                  (item:any) =>
                    item.entity_type ===
                      entityType &&
                    item.entity_key ===
                      entityKey &&
                    item.city ===
                      m.city &&
                    item.track ===
                      (
                        race.track ??
                        "unknown"
                      ) &&
                    item.distance_band ===
                      band
                );

              if (!row) {
                return null;
              }

              return {
                sampleSize:
                  Number(
                    row.sample_size
                  ),

                winRate:
                  Number(
                    row.win_rate
                  ),

                top3Rate:
                  Number(
                    row.top3_rate
                  )
              };
            };

            const scoredRunners =
              baseScoredRunners.map(
                (runner:any) => {
                  const horseId =
                    runner.horse_id ??
                    horseIdentity(
                      runner.horse_name,
                      runner.horse_profile_url
                    );

                  const jockeyId =
                    runner.jockey_id ??
                    null;

                  const pairId =
                    jockeyId
                      ? `${horseId}|${jockeyId}`
                      : null;

                  const learningInput = {
                    global:
                      globalRates,

                    horse:
                      priorFor(
                        "horse",
                        horseId
                      ),

                    jockey:
                      priorFor(
                        "jockey",
                        jockeyId
                      ),

                    pair:
                      priorFor(
                        "horse_jockey",
                        pairId
                      )
                  };

                  /*
                   * Shadow model:
                   * full learned adjustment, never served
                   * as production prediction before gate.
                   */
                  const shadowModelScore =
                    applyLearningAdjustment(
                      runner.modelScore,
                      {
                        ...learningInput,
                        scale: 1
                      }
                    );

                  /*
                   * Production model:
                   * controlled by evaluated safety gate.
                   */
                  const modelScore =
                    applyLearningAdjustment(
                      runner.modelScore,
                      {
                        ...learningInput,
                        scale:
                          learningScale
                      }
                    );

                  return {
                    ...runner,

                    shadowModelScore,

                    modelScore
                  };
                }
              );

            const uncertainty =
              raceUncertainty(
                scoredRunners
              );

            const couponStrategy =
              recommendCouponStrategy(
                scoredRunners,
                uncertainty
              );

            return {
              ...race,

              uncertainty,

              couponStrategy,

              runners:
                scoredRunners
            };
          }
        )
    };
  });
}
