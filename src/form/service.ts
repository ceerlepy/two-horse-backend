import type {
  Env
} from "../env";

import {
  acquireHorseHistory
} from "./acquisition";

import {
  formCandidates,
  isFormFresh,
  markFormFailure,
  persistHorseHistory
} from "./repository";

const FORM_TTL_MS =
  6 * 60 * 60 * 1000;

const FORM_CONCURRENCY =
  2;

const FORM_BATCH_SIZE =
  12;

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
    while (true) {
      const index =
        cursor++;

      if (
        index >=
        items.length
      ) {
        return;
      }

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

export async function refreshHorseForms(
  env: Env,
  force = false
): Promise<any> {
  const candidates =
    await formCandidates(
      env,
      FORM_BATCH_SIZE
    );

  const results =
    await mapLimit(
      candidates,
      FORM_CONCURRENCY,

      async candidate => {
        if (
          !force &&
          await isFormFresh(
            env,
            candidate.horseKey,
            FORM_TTL_MS
          )
        ) {
          return {
            horseKey:
              candidate.horseKey,

            horseName:
              candidate.horseName,

            status:
              "fresh"
          };
        }

        try {
          const acquired =
            await acquireHorseHistory(
              env,
              candidate.sourceUrl
            );

          await persistHorseHistory(
            env,
            candidate,
            acquired.rows,
            acquired.method
          );

          return {
            horseKey:
              candidate.horseKey,

            horseName:
              candidate.horseName,

            status:
              "updated",

            rows:
              acquired.rows.length,

            method:
              acquired.method
          };
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : String(error);

          await markFormFailure(
            env,
            candidate,
            message
          );

          /*
           * Existing horse_form_history is intentionally
           * NOT deleted. That is our last-good cache.
           */
          return {
            horseKey:
              candidate.horseKey,

            horseName:
              candidate.horseName,

            status:
              "stale-cache",

            error:
              message
          };
        }
      }
    );

  return {
    processed:
      results.length,

    results
  };
}
