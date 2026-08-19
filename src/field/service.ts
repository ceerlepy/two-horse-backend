import type {
  Env
} from "../env";

import {
  acquireTjkFieldPage
} from "./acquisition";

import {
  scoreTjkFieldHistory
} from "./tjk-field-score";

import {
  fieldRaceCandidates,
  markFieldRaceFailure,
  normalizedHorseName,
  persistFieldRace
} from "./repository";

const CONCURRENCY =
  2;

const BATCH_SIZE =
  6;

async function mapLimit<T, R>(
  input: T[],
  limit: number,
  fn:
    (value: T) =>
      Promise<R>
): Promise<R[]> {
  const result:
    R[] = [];

  let cursor = 0;

  async function worker():
    Promise<void> {
    while (true) {
      const index =
        cursor++;

      if (
        index >=
        input.length
      ) {
        return;
      }

      result[index] =
        await fn(
          input[index]
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            limit,
            input.length
          )
      },
      () => worker()
    )
  );

  return result;
}

export async function refreshFieldSignalsIfDue(
  env: Env
): Promise<void> {
  const candidates =
    await fieldRaceCandidates(
      env,
      BATCH_SIZE
    );

  await mapLimit(
    candidates,
    CONCURRENCY,

    async candidate => {
      try {
        const acquired =
          await acquireTjkFieldPage(
            env,
            candidate.performanceUrl
          );

        const byHorse =
          new Map<
            string,
            typeof acquired.value.rows
          >();

        for (
          const row of
          acquired.value.rows
        ) {
          const key =
            normalizedHorseName(
              row.horseName
            );

          (
            byHorse.get(key) ??
            (() => {
              const rows:
                typeof acquired.value.rows =
                [];

              byHorse.set(
                key,
                rows
              );

              return rows;
            })()
          ).push(row);
        }

        const scores =
          candidate.runners.map(
            runner => {
              const history =
                byHorse.get(
                  normalizedHorseName(
                    runner.horseName
                  )
                ) ?? [];

              const scored =
                scoreTjkFieldHistory(
                  history
                );

              return {
                horseNumber:
                  runner.horseNumber,

                score:
                  scored.score,

                sampleSize:
                  scored.sampleSize
              };
            }
          );

        /*
         * Persist acquisition output even when no
         * runner could be scored. Repository retry
         * policy will revisit null-only races.
         */
        await persistFieldRace(
          env,
          candidate,
          scores,
          acquired.method
        );
      } catch (error) {
        await markFieldRaceFailure(
          env,
          candidate,
          error instanceof Error
            ? error.message
            : String(error)
        );
      }
    }
  );
}
