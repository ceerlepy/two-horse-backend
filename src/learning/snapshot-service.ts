import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  getToday
} from "../storage/program-repository";

import {
  insertLearningRace,
  insertLearningRunner,
  insertLearningExpertPick
} from "./repository";

import {
  upsertLearningCandidate,
  deleteLearningCandidate
} from "./candidate-repository";

import {
  loadRaceMarketFeatures
} from "./market-features";


interface CandidateRow {
  race_date: string;
  city: string;
  race_number: number;
  starts_at: string;
  captured_at: string;
  snapshot_json: string;
}


function componentScore(
  runner: any,
  key: string
): number | null {
  const component =
    runner
      ?.modelScore
      ?.components
      ?.find(
        (item:any) =>
          item.key === key
      );

  return component?.score == null
    ? null
    : Number(
        component.score
      );
}


/*
 * Capture canonical scoring candidates for ALL
 * not-yet-started races.
 *
 * We do NOT wait for the final five minutes.
 * This is what provides cron/outage resilience.
 */
export async function capturePreRaceCandidates(
  env: Env
): Promise<{
  races: number;
}> {
  const now =
    new Date();

  const nowIso =
    now.toISOString();

  const raceDate =
    turkeyDate();

  /*
   * Single canonical assembly.
   *
   * Same AGF / form / HP / expert / market /
   * weight / field / scoring path as API.
   */
  const meetings =
    await getToday(env);

  let captured = 0;

  for (
    const meeting of meetings
  ) {
    for (
      const race of
      meeting.races ?? []
    ) {
      const startsAt =
        String(
          race.starts_at ??
          ""
        );

      const starts =
        Date.parse(
          startsAt
        );

      if (
        !Number.isFinite(starts) ||
        now.getTime() >= starts
      ) {
        continue;
      }

      const ok =
        await upsertLearningCandidate(
          env,
          {
            raceDate,

            city:
              meeting.city,

            raceNumber:
              Number(
                race.race_number
              ),

            startsAt,
            capturedAt:
              nowIso,

            /*
             * Freeze the complete canonical scored
             * representation at acquisition time.
             */
            snapshot: {
              raceDate,

              city:
                meeting.city,

              raceNumber:
                Number(
                  race.race_number
                ),

              startsAt,

              distanceMeters:
                race.distance_meters ??
                null,

              track:
                race.track ??
                null,

              runners:
                race.runners ?? []
            }
          }
        );

      if (ok) {
        captured += 1;
      }
    }
  }

  return {
    races:
      captured
  };
}


/*
 * Promote the latest stored PRE-RACE candidate after
 * official start time.
 *
 * This function never calls getToday() to rebuild
 * historical features.
 *
 * Therefore post-race state cannot contaminate
 * frozen training features.
 */
export async function promoteStartedCandidates(
  env: Env
): Promise<{
  races: number;
  runners: number;
}> {
  const nowIso =
    new Date()
      .toISOString();

  const rows =
    await env.DB.prepare(`
      SELECT
        race_date,
        city,
        race_number,
        starts_at,
        captured_at,
        snapshot_json

      FROM learning_snapshot_candidates

      WHERE
        starts_at <= ?

        AND captured_at <
          starts_at

      ORDER BY
        starts_at
    `)
      .bind(
        nowIso
      )
      .all<CandidateRow>();

  let raceCount = 0;
  let runnerCount = 0;

  for (
    const row of
    rows.results ?? []
  ) {
    const existing =
      await env.DB.prepare(`
        SELECT 1 AS found

        FROM learning_races

        WHERE
          race_date = ?
          AND city = ?
          AND race_number = ?

        LIMIT 1
      `)
        .bind(
          row.race_date,
          row.city,
          row.race_number
        )
        .first<any>();

    /*
     * Idempotent recovery:
     * if already promoted, candidate can safely go.
     */
    if (existing) {
      await deleteLearningCandidate(
        env,
        {
          raceDate:
            row.race_date,

          city:
            row.city,

          raceNumber:
            row.race_number
        }
      );

      continue;
    }

    const snapshot =
      JSON.parse(
        row.snapshot_json
      );

    const runners =
      Array.isArray(
        snapshot.runners
      )
        ? snapshot.runners
        : [];

    if (!runners.length) {
      /*
       * Never create a half-useful training race.
       */
      continue;
    }

    /*
     * Derive market summaries using the candidate's
     * own captured_at as a HARD cutoff.
     *
     * Promotion may happen later; data after the cutoff
     * remains invisible.
     */
    const market =
      await loadRaceMarketFeatures(
        env,
        {
          raceDate:
            row.race_date,

          city:
            row.city,

          raceNumber:
            row.race_number,

          startsAt:
            row.starts_at,

          cutoffAt:
            row.captured_at
        }
      );

    await insertLearningRace(
      env,
      {
        raceDate:
          row.race_date,

        city:
          row.city,

        raceNumber:
          row.race_number,

        startsAt:
          row.starts_at,

        distanceMeters:
          snapshot
            .distanceMeters ??
          null,

        track:
          snapshot.track ??
          null,

        /*
         * Provenance:
         * snapshotAt is observation time,
         * NOT promotion time.
         */
        snapshotAt:
          row.captured_at
      }
    );

    for (
      const runner of runners
    ) {
      const expert =
        runner
          .expertConsensus ??
        {};

      const marketFeatures =
        market.get(
          Number(
            runner.horse_number
          )
        );

      const finalAgf =
        marketFeatures
          ?.final ??
        runner.agf_percent ??
        null;

      await insertLearningRunner(
        env,
        {
          raceDate:
            row.race_date,

          city:
            row.city,

          raceNumber:
            row.race_number,

          horseNumber:
            Number(
              runner.horse_number
            ),

          horseName:
            String(
              runner.horse_name
            ),

          horseId:
            runner.horse_id ??
            null,

          jockey:
            runner.jockey ??
            null,

          jockeyId:
            runner.jockey_id ??
            null,

          weight:
            runner.weight ??
            null,

          hp:
            runner.hp ??
            null,

          finalAgf,

          recentFormRaw:
            runner
              .recent_form_raw ??
            null,

          formScore:
            componentScore(
              runner,
              "form"
            ),

          marketScore:
            componentScore(
              runner,
              "market"
            ),

          agfT90:
            marketFeatures
              ?.t90 ??
            null,

          agfT30:
            marketFeatures
              ?.t30 ??
            null,

          agfT5:
            marketFeatures
              ?.t5 ??
            null,

          agfFinal:
            finalAgf,

          agfMaxRise:
            marketFeatures
              ?.maxRise ??
            null,

          agfMaxFall:
            marketFeatures
              ?.maxFall ??
            null,

          expertScore:
            componentScore(
              runner,
              "expert"
            ),

          expertSourceCount:
            Number(
              expert
                .sourceCount ??
              0
            ),

          expertBankoCount:
            Number(
              expert
                .bankoCount ??
              0
            ),

          expertFavoriteCount:
            Number(
              expert
                .favoriteCount ??
              0
            ),

          expertRivalCount:
            Number(
              expert
                .rivalCount ??
              0
            ),

          expertSurpriseCount:
            Number(
              expert
                .surpriseCount ??
              0
            ),

          fieldScore:
            componentScore(
              runner,
              "field"
            ),

          /*
           * Preserve both sides of the learning layer.
           *
           * baseScore is the deterministic race-day model
           * before historical calibration.
           *
           * modelScore is the bounded adjusted final score.
           */
          baseModelScore:
            runner
              .modelScore
              ?.baseScore ??
            runner
              .modelScore
              ?.score ??
            null,

          learningAdjustment:
            runner
              .modelScore
              ?.learningAdjustment ??
            0,

          modelScore:
            runner
              .modelScore
              ?.score ??
            null,

          modelConfidence:
            runner
              .modelScore
              ?.confidence ??
            null,

          snapshotAt:
            row.captured_at
        }
      );

      for (
        const pick of
        runner.expertPredictions ??
        []
      ) {
        await insertLearningExpertPick(
          env,
          {
            raceDate:
              row.race_date,

            city:
              row.city,

            raceNumber:
              row.race_number,

            horseNumber:
              Number(
                runner.horse_number
              ),

            horseId:
              runner.horse_id ??
              null,

            horseName:
              String(
                runner.horse_name
              ),

            sourceKey:
              String(
                pick.source_key
              ),

            confidence:
              pick.confidence ==
                null
                ? null
                : Number(
                    pick.confidence
                  ),

            isBanko:
              Boolean(
                pick.is_banko
              ),

            isFavorite:
              Boolean(
                pick.is_favorite
              ),

            isStrong:
              Boolean(
                pick.is_strong
              ),

            isStar:
              Boolean(
                pick.is_star
              ),

            isRival:
              Boolean(
                pick.is_rival
              ),

            isSurprise:
              Boolean(
                pick.is_surprise
              ),

            isAvoid:
              Boolean(
                pick.is_avoid
              ),

            snapshotAt:
              row.captured_at
          }
        );
      }

      runnerCount += 1;
    }

    await deleteLearningCandidate(
      env,
      {
        raceDate:
          row.race_date,

        city:
          row.city,

        raceNumber:
          row.race_number
      }
    );

    raceCount += 1;
  }

  return {
    races:
      raceCount,

    runners:
      runnerCount
  };
}
