import type {
  OfficialMeetingResults
} from "./types";


export function validateOfficialResults(
  result:
    OfficialMeetingResults
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

  if (!result.races.length) {
    throw new Error(
      "RESULT_NO_FINAL_RACES"
    );
  }

  const raceNumbers =
    new Set<number>();

  for (
    const race of
    result.races
  ) {
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
      raceNumbers.has(
        race.raceNumber
      )
    ) {
      throw new Error(
        `RESULT_DUPLICATE_RACE:${race.raceNumber}`
      );
    }

    raceNumbers.add(
      race.raceNumber
    );

    if (
      race.runners.length < 2
    ) {
      throw new Error(
        `RESULT_TOO_FEW_RUNNERS:R${race.raceNumber}`
      );
    }

    const horseNumbers =
      new Set<number>();

    let winnerCount = 0;

    for (
      const runner of
      race.runners
    ) {
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
        !runner.horseName.trim()
      ) {
        throw new Error(
          `RESULT_EMPTY_HORSE:R${race.raceNumber}:#${runner.horseNumber}`
        );
      }

      if (
        !Number.isInteger(
          runner.finishPosition
        ) ||
        runner.finishPosition < 0
      ) {
        throw new Error(
          `RESULT_INVALID_FINISH:R${race.raceNumber}:#${runner.horseNumber}`
        );
      }

      if (
        runner.finishPosition === 1
      ) {
        winnerCount += 1;
      }
    }

    /*
     * At least one official winner is required.
     *
     * More than one winner is legal for dead heat.
     */
    if (
      winnerCount < 1
    ) {
      throw new Error(
        `RESULT_NOT_FINAL:R${race.raceNumber}`
      );
    }
  }
}
