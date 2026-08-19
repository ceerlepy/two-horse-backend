import type {
  Env
} from "../env";

import {
  acquireOfficialResults
} from "./acquisition";

import {
  attachMeetingResultsToLearning
} from "./learning-labels";

import {
  rebuildLearningPriors
} from "../learning/priors";

import {
  evaluateLearningModel
} from "../learning/evaluation";


export async function ingestOfficialResults(
  env: Env,
  input: {
    url: string;
    city: string;
    raceDate: string;
  }
): Promise<{
  method: string;
  raceCount: number;
  labelledRaces: number;
  labelledRunners: number;
  skippedRaces: number;
}> {
  const attemptAt =
    new Date().toISOString();

  try {
    const acquired =
      await acquireOfficialResults(
        env,
        input
      );

    const labels =
      await attachMeetingResultsToLearning(
        env,
        acquired.value
      );

    /*
     * Rebuild priors only after official labels
     * have been safely attached.
     */
    if (
      labels.labelledRunners > 0
    ) {
      await rebuildLearningPriors(
        env
      );

      /*
       * Compare base vs learned model only after
       * fresh official labels have landed.
       */
      await evaluateLearningModel(
        env
      );
    }

    await env.DB.prepare(`
      INSERT INTO official_result_runs(
        race_date,
        city,
        last_attempt_at,
        last_success_at,
        method,
        status,
        detail
      )
      VALUES(?,?,?,?,?,?,?)

      ON CONFLICT(
        race_date,
        city
      )
      DO UPDATE SET
        last_attempt_at =
          excluded.last_attempt_at,

        last_success_at =
          excluded.last_success_at,

        method =
          excluded.method,

        status =
          excluded.status,

        detail =
          excluded.detail
    `)
      .bind(
        input.raceDate,
        input.city,
        attemptAt,
        new Date().toISOString(),
        acquired.method,
        "ok",
        JSON.stringify({
          raceCount:
            acquired.value.races.length,

          ...labels
        })
      )
      .run();

    return {
      method:
        acquired.method,

      raceCount:
        acquired.value.races.length,

      ...labels
    };
  } catch (error) {
    await env.DB.prepare(`
      INSERT INTO official_result_runs(
        race_date,
        city,
        last_attempt_at,
        method,
        status,
        detail
      )
      VALUES(?,?,?,?,?,?)

      ON CONFLICT(
        race_date,
        city
      )
      DO UPDATE SET
        last_attempt_at =
          excluded.last_attempt_at,

        method =
          excluded.method,

        status =
          excluded.status,

        detail =
          excluded.detail
    `)
      .bind(
        input.raceDate,
        input.city,
        attemptAt,
        null,
        "error",
        error instanceof Error
          ? error.message
          : String(error)
      )
      .run();

    throw error;
  }
}
