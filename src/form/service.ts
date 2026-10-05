import type {
  Env
} from "../env";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  parseHorseHistoryPage
} from "./history-parser";

import {
  formCandidates,
  markFormFailure,
  persistHorseHistory,
  raceFormRuns
} from "./repository";

import type {
  HorseHistoryRun
} from "./types";

/*
 * TJK race history per horse (AtKosuBilgileri), collected by the
 * cron for every horse on today's and tomorrow's cards. Plain HTTP
 * only: with the browser user agent TJK answers in about a second,
 * so no Browser Rendering or Workers AI is ever spent here.
 */
export const HORSE_FORM_CONFIG = {
  /* History only changes after a horse runs, so once a day. */
  refreshAfterMinutes: 20 * 60,
  retryFailedAfterMinutes: 60,
  batchSize: 12,
  concurrency: 3,
  fetchTimeoutMs: 20_000,
  /* Bounds the table: newest runs per horse kept, older deleted. */
  maxRunsPerHorse: 20,
  apiRunsPerHorse: 6
} as const;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn:
    (item: T) =>
      Promise<R>
): Promise<R[]> {
  const output:
    R[] = [];

  let cursor = 0;

  async function worker():
    Promise<void> {
    while (cursor < items.length) {
      const index =
        cursor++;

      output[index] =
        await fn(
          items[index]
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length
          )
      },
      () => worker()
    )
  );

  return output;
}

/*
 * A first-time starter's page renders the results table with a
 * "no matching data" row. That is a real, empty history, not a
 * failure, so it must not be retried every hour.
 */
export function isEmptyHistoryPage(
  html: string
): boolean {
  return (
    html.includes("queryTable") &&
    /uygun veri bulunmamaktad/i.test(html)
  );
}

export async function fetchHorseHistory(
  url: string
): Promise<HorseHistoryRun[]> {
  const acquired =
    await acquireHttpHtml(
      url,
      {
        timeoutMs:
          HORSE_FORM_CONFIG.fetchTimeoutMs,
        minimumBytes:
          1_000
      }
    );

  const rows =
    parseHorseHistoryPage(
      acquired.html
    );

  if (
    !rows.length &&
    !isEmptyHistoryPage(
      acquired.html
    )
  ) {
    throw new Error(
      "FORM_TABLE_NOT_FOUND"
    );
  }

  return rows;
}

export async function refreshHorseForms(
  env: Env,
  force = false
): Promise<any> {
  const candidates =
    await formCandidates(
      env,
      {
        limit:
          HORSE_FORM_CONFIG.batchSize,
        refreshAfterMinutes:
          HORSE_FORM_CONFIG.refreshAfterMinutes,
        retryFailedAfterMinutes:
          HORSE_FORM_CONFIG.retryFailedAfterMinutes,
        force
      }
    );

  const results =
    await mapLimit(
      candidates,
      HORSE_FORM_CONFIG.concurrency,

      async candidate => {
        try {
          const rows =
            await fetchHorseHistory(
              candidate.sourceUrl
            );

          await persistHorseHistory(
            env,
            candidate,
            rows,
            "http",
            HORSE_FORM_CONFIG.maxRunsPerHorse
          );

          return {
            horseKey:
              candidate.horseKey,
            status:
              "updated",
            rows:
              rows.length
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          /*
           * Existing horse_form_history is intentionally
           * NOT deleted. That is our last-good cache.
           */
          await markFormFailure(
            env,
            candidate,
            message
          );

          return {
            horseKey:
              candidate.horseKey,
            status:
              "failed",
            error:
              message
          };
        }
      }
    );

  return {
    processed:
      results.length,

    updated:
      results.filter(
        result =>
          result.status === "updated"
      ).length,

    results
  };
}

export interface RaceFormResult {
  raceDate: string;
  city: string;
  raceNumber: number;
  horses: Array<{
    horseNumber: number;
    horseName: string;
    runs: HorseHistoryRun[];
  }>;
}

export async function getRaceForm(
  env: Env,
  raceDate: string,
  city: string,
  raceNumber: number
): Promise<RaceFormResult> {
  const { runners, runs } =
    await raceFormRuns(
      env,
      raceDate,
      city,
      raceNumber,
      HORSE_FORM_CONFIG.apiRunsPerHorse
    );

  return {
    raceDate,
    city,
    raceNumber,

    horses:
      runners.map(
        runner => ({
          horseNumber:
            runner.horseNumber,

          horseName:
            runner.horseName,

          runs:
            runner.horseKey
              ? runs.get(runner.horseKey) ?? []
              : []
        })
      )
  };
}
