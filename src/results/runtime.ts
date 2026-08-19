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


const RESULT_DELAY_MINUTES =
  5;

const RETRY_MINUTES =
  10;


export async function ingestOfficialResultsDue(
  env: Env
): Promise<{
  meetings: number;
  labelledRaces: number;
  labelledRunners: number;
}> {
  const pending =
    await env.DB.prepare(`
      SELECT DISTINCT
        lr.race_date,
        lr.city

      FROM learning_races lr

      WHERE
        lr.labelled_at IS NULL

        AND lr.starts_at <=
          datetime(
            'now',
            ?
          )

        AND NOT EXISTS (
          SELECT 1

          FROM official_result_runs rr

          WHERE
            rr.race_date =
              lr.race_date

            AND rr.city =
              lr.city

            AND rr.last_attempt_at >
              datetime(
                'now',
                ?
              )
        )

      ORDER BY
        lr.race_date,
        lr.city
    `)
      .bind(
        `-${RESULT_DELAY_MINUTES} minutes`,
        `-${RETRY_MINUTES} minutes`
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
