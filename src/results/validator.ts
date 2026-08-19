import type {
  OfficialMeetingResults
} from "./types";


function normalizeName(
  value: string
): string {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR");
}


export function validateOfficialResults(
  result: OfficialMeetingResults
): void {
  if (!result.city.trim()) {
    throw new Error(
      "RESULT_CITY_MISSING"
    );
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      result.raceDate
    )
  ) {
    throw new Error(
      "RESULT_DATE_INVALID"
    );
  }

  if (result.races.length === 0) {
    throw new Error(
      "RESULT_NO_RACES"
    );
  }

  const seenRaces =
    new Set<number>();

  for (const race of result.races) {
    if (
      !Number.isInteger(
        race.raceNumber
      ) ||
      race.raceNumber <= 0
    ) {
      throw new Error(
        "RESULT_RACE_NUMBER_INVALID"
      );
    }

    if (
      seenRaces.has(
        race.raceNumber
      )
    ) {
      throw new Error(
        `RESULT_DUPLICATE_RACE:${race.raceNumber}`
      );
    }

    seenRaces.add(
      race.raceNumber
    );

    /*
     * A single runner is not enough evidence that
     * we acquired a complete official result table.
     */
    if (race.runners.length < 2) {
      throw new Error(
        `RESULT_TOO_FEW_RUNNERS:R${race.raceNumber}`
      );
    }

    const horseNumbers =
      new Set<number>();

    const positivePositions =
      new Set<number>();

    let winnerCount = 0;

    for (const runner of race.runners) {
      if (
        !Number.isInteger(
          runner.horseNumber
        ) ||
        runner.horseNumber <= 0
      ) {
        throw new Error(
          `RESULT_HORSE_NUMBER_INVALID:R${race.raceNumber}`
        );
      }

      if (
        horseNumbers.has(
          runner.horseNumber
        )
      ) {
        throw new Error(
          `RESULT_DUPLICATE_HORSE:R${race.raceNumber}:#${runner.horseNumber}`
        );
      }

      horseNumbers.add(
        runner.horseNumber
      );

      if (
        !normalizeName(
          runner.horseName
        )
      ) {
        throw new Error(
          `RESULT_HORSE_NAME_EMPTY:R${race.raceNumber}:#${runner.horseNumber}`
        );
      }

      /*
       * 0 is reserved for an official
       * unplaced/derecesiz style result.
       */
      if (
        !Number.isInteger(
          runner.finishPosition
        ) ||
        runner.finishPosition < 0
      ) {
        throw new Error(
          `RESULT_FINISH_INVALID:R${race.raceNumber}:#${runner.horseNumber}`
        );
      }

      if (
        runner.finishPosition > 0
      ) {
        if (
          positivePositions.has(
            runner.finishPosition
          )
        ) {
          throw new Error(
            `RESULT_DUPLICATE_FINISH:R${race.raceNumber}:P${runner.finishPosition}`
          );
        }

        positivePositions.add(
          runner.finishPosition
        );
      }

      if (
        runner.finishPosition === 1
      ) {
        winnerCount += 1;
      }
    }

    /*
     * This prevents partial/live tables from
     * becoming training labels.
     */
    if (winnerCount !== 1) {
      throw new Error(
        `RESULT_NOT_FINAL:R${race.raceNumber}:WINNERS=${winnerCount}`
      );
    }
  }
}
