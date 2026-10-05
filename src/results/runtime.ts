import type {
  Env
} from "../env";

import {
  buildOfficialResultsUrl
} from "./url";

import {
  ingestOfficialResults
} from "./service";


interface PendingMeeting {
  race_date: string;
  city: string;
}


/*
 * A meeting becomes eligible once its LAST race started this long
 * ago, so TJK has published final results for the whole card.
 */
const RESULT_DELAY_MINUTES =
  45;

/*
 * A failed meeting is retried at most once per this interval.
 */
const RETRY_MINUTES =
  60;

/*
 * Automatic retries stop after this many days. Older gaps are
 * repaired only through the explicit backfill endpoint, instead of
 * paying for browser + AI acquisition on every cron forever (live
 * D1 still retried 2026-08-22 meetings on 2026-10-04).
 */
const MAX_AUTOMATIC_RETRY_DAYS =
  3;

/*
 * Each meeting costs an HTTP fetch plus Browser Rendering (and an
 * AI fallback). Doing a whole backlog in one tick made those calls
 * compete with each other and fail together; a small batch per
 * 5-minute tick spreads them out.
 */
const MAX_MEETINGS_PER_RUN =
  2;


function isoMinutesAgo(
  minutes: number
): string {
  return new Date(
    Date.now() -
    minutes * 60_000
  ).toISOString();
}


function isoDateDaysAgo(
  days: number
): string {
  return new Date(
    Date.now() -
    days * 86_400_000
  )
    .toISOString()
    .slice(0, 10);
}


export async function ingestOfficialResultsDue(
  env: Env
): Promise<{
  meetings: number;
  labelledRaces: number;
  labelledRunners: number;
}> {
  /*
   * starts_at and last_attempt_at are stored as ISO strings
   * ("2026-09-30T09:00:00.000Z"). They used to be compared with
   * SQLite datetime() ("2026-09-30 09:00:00"); because "T" sorts
   * after " ", same-day rows always looked "in the future", so a
   * meeting was only ever tried once per UTC day and a failure was
   * not retried until the next day. Compare ISO with ISO instead.
   */
  const pending =
    await env.DB.prepare(`
      SELECT
        lr.race_date,
        lr.city

      FROM learning_races lr

      WHERE
        lr.labelled_at IS NULL

        AND lr.race_date >= ?

        AND NOT EXISTS (
          SELECT 1

          FROM official_result_runs rr

          WHERE
            rr.race_date =
              lr.race_date

            AND rr.city =
              lr.city

            AND rr.last_attempt_at > ?
        )

      GROUP BY
        lr.race_date,
        lr.city

      HAVING
        MAX(lr.starts_at) <= ?

      ORDER BY
        lr.race_date DESC,
        lr.city

      LIMIT ?
    `)
      .bind(
        isoDateDaysAgo(
          MAX_AUTOMATIC_RETRY_DAYS
        ),
        isoMinutesAgo(
          RETRY_MINUTES
        ),
        isoMinutesAgo(
          RESULT_DELAY_MINUTES
        ),
        MAX_MEETINGS_PER_RUN
      )
      .all<PendingMeeting>();

  let meetings = 0;
  let labelledRaces = 0;
  let labelledRunners = 0;

  for (
    const item of
    pending.results ?? []
  ) {
    try {
      const result =
        await ingestOfficialResults(
          env,
          {
            raceDate:
              item.race_date,

            city:
              item.city,

            url:
              buildOfficialResultsUrl(
                item.race_date,
                item.city
              )
          }
        );

      meetings += 1;

      labelledRaces +=
        result.labelledRaces;

      labelledRunners +=
        result.labelledRunners;
    } catch (error) {
      /*
       * Result may simply not be official yet.
       * service.ts records diagnostics and the
       * next eligible cron retries later.
       */
      console.warn(
        "[RESULTS] ingestion pending",
        item.race_date,
        item.city,
        error
      );
    }
  }

  return {
    meetings,
    labelledRaces,
    labelledRunners
  };
}


export interface LearningLabelBackfillResult {
  selectedMeetings: number;
  successfulMeetings: number;
  failedMeetings: number;

  labelledRaces: number;
  labelledRunners: number;
  skippedRaces: number;

  remainingMeetings: number;

  failures: {
    raceDate: string;
    city: string;
    error: string;
  }[];
}


function boundedBackfillLimit(
  value: number | undefined
): number {
  if (
    !Number.isFinite(value)
  ) {
    return 5;
  }

  return Math.min(
    20,
    Math.max(
      1,
      Math.trunc(
        value as number
      )
    )
  );
}


/*
 * HISTORICAL LEARNING LABEL BACKFILL
 *
 * This intentionally does NOT manufacture labels.
 *
 * It merely re-runs eligible historical meetings
 * through the same official-result acquisition and
 * strict frozen-snapshot validation used by normal
 * production ingestion.
 *
 * Safety remains in learning-labels.ts:
 *
 *   NO_FROZEN_SNAPSHOT       -> skip
 *   RUNNER_COUNT_MISMATCH    -> skip
 *   RUNNER_IDENTITY_MISMATCH -> skip
 *
 * Only a complete immutable pre-race runner match
 * is allowed to receive official finish positions.
 */
export async function backfillLearningLabels(
  env: Env,
  input: {
    limit?: number;
  } = {}
): Promise<LearningLabelBackfillResult> {
  const limit =
    boundedBackfillLimit(
      input.limit
    );

  /*
   * Historical races are eligible when:
   *
   * - learning_races still has no meeting label
   * - the race is safely in the past
   *
   * Yesterday-or-earlier races are included even when
   * legacy starts_at data is absent.
   */
  const pending =
    await env.DB.prepare(`
      SELECT DISTINCT
        lr.race_date,
        lr.city

      FROM learning_races lr

      WHERE
        lr.labelled_at IS NULL

        AND (
          lr.race_date <
            date('now')

          OR (
            lr.starts_at IS NOT NULL

            AND lr.starts_at <=
              datetime(
                'now',
                '-${RESULT_DELAY_MINUTES} minutes'
              )
          )
        )

      ORDER BY
        lr.race_date ASC,
        lr.city ASC

      LIMIT ?
    `)
      .bind(limit)
      .all<PendingMeeting>();

  const selected =
    pending.results ?? [];

  let successfulMeetings = 0;
  let failedMeetings = 0;

  let labelledRaces = 0;
  let labelledRunners = 0;
  let skippedRaces = 0;

  const failures:
    LearningLabelBackfillResult[
      "failures"
    ] = [];

  for (
    const meeting of
    selected
  ) {
    try {
      const result =
        await ingestOfficialResults(
          env,
          {
            raceDate:
              meeting.race_date,

            city:
              meeting.city,

            url:
              buildOfficialResultsUrl(
                meeting.race_date,
                meeting.city
              )
          }
        );

      successfulMeetings += 1;

      labelledRaces +=
        result.labelledRaces;

      labelledRunners +=
        result.labelledRunners;

      skippedRaces +=
        result.skippedRaces;
    } catch (error) {
      failedMeetings += 1;

      failures.push({
        raceDate:
          meeting.race_date,

        city:
          meeting.city,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });

      /*
       * One bad historical meeting must not stop
       * backfilling the remaining eligible meetings.
       */
      console.warn(
        "[RESULTS] historical label backfill failed",
        meeting.race_date,
        meeting.city,
        error
      );
    }
  }

  const remaining =
    await env.DB.prepare(`
      SELECT
        COUNT(*) AS count

      FROM (
        SELECT DISTINCT
          race_date,
          city

        FROM learning_races

        WHERE
          labelled_at IS NULL

          AND (
            race_date <
              date('now')

            OR (
              starts_at IS NOT NULL

              AND starts_at <=
                datetime(
                  'now',
                  '-${RESULT_DELAY_MINUTES} minutes'
                )
            )
          )
      )
    `)
      .first<{
        count: number | null;
      }>();

  return {
    selectedMeetings:
      selected.length,

    successfulMeetings,

    failedMeetings,

    labelledRaces,
    labelledRunners,
    skippedRaces,

    remainingMeetings:
      Number(
        remaining?.count ??
        0
      ),

    failures
  };
}
