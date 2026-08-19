import type {
  Env
} from "../env";

import {
  getToday
} from "../storage/program-repository";

import {
  sixFoldUnitPrice
} from "./types";

import {
  optimizeSixFoldCoupons
} from "./optimizer";


function normalize(
  value:
    string
): string {
  return value
    .trim()
    .toLocaleLowerCase(
      "tr-TR"
    );
}


export async function generateSixFoldCoupons(
  env: Env,
  input: {
    city: string;

    budgetTl: number;

    sixfold?: number;

    multiplier?: number;
  }
) {
  const meetings =
    await getToday(env);

  const meeting =
    meetings.find(
      (item:any) =>
        normalize(
          String(item.city)
        ) ===
        normalize(
          input.city
        )
    );

  if (!meeting) {
    throw new Error(
      "MEETING_NOT_FOUND"
    );
  }

  const races =
    [...(
      meeting.races ??
      []
    )]
      .sort(
        (a:any, b:any) =>
          Number(
            a.race_number
          ) -
          Number(
            b.race_number
          )
      );

  if (
    races.length < 6
  ) {
    throw new Error(
      "NOT_ENOUGH_RACES_FOR_SIX_FOLD"
    );
  }

  const sixfold =
    input.sixfold ??
    1;

  if (
    sixfold !== 1 &&
    sixfold !== 2
  ) {
    throw new Error(
      "INVALID_SIXFOLD_NUMBER"
    );
  }

  /*
   * First six-fold:
   *   first six races.
   *
   * Second six-fold:
   *   last six races.
   *
   * For an 8-race card this is 1-6 and 3-8.
   */
  const startIndex =
    sixfold === 1
      ? 0
      : races.length - 6;

  const selectedRaces =
    races.slice(
      startIndex,
      startIndex + 6
    );

  if (
    selectedRaces.length !== 6
  ) {
    throw new Error(
      "SIX_FOLD_WINDOW_NOT_AVAILABLE"
    );
  }

  const legs =
    selectedRaces.map(
      (race:any) => {
        const runners =
          [...(
            race.runners ??
            []
          )]
            .filter(
              (runner:any) =>
                runner
                  ?.modelScore
                  ?.score != null
            )
            .map(
              (runner:any) => ({
                horseNumber:
                  Number(
                    runner
                      .horse_number
                  ),

                horseName:
                  runner
                    .horse_name ??
                  null,

                score:
                  Number(
                    runner
                      .modelScore
                      .score
                  ),

                confidence:
                  Number(
                    runner
                      .modelScore
                      .confidence ??
                    0
                  )
              })
            );

        return {
          raceNumber:
            Number(
              race.race_number
            ),

          uncertainty:
            Number(
              race
                .uncertainty
                ?.expansionPressure ??
              0.5
            ),

          runners
        };
      }
    );

  const unitPriceTl =
    sixFoldUnitPrice({
      city:
        String(
          meeting.city
        )
    });

  const coupons =
    optimizeSixFoldCoupons({
      legs,

      budgetTl:
        input.budgetTl,

      unitPriceTl,

      multiplier:
        input.multiplier ??
        1
    });

  return {
    date:
      meeting.race_date ??
      null,

    city:
      meeting.city,

    sixfold,

    startRace:
      Number(
        selectedRaces[0]
          .race_number
      ),

    endRace:
      Number(
        selectedRaces[5]
          .race_number
      ),

    budgetTl:
      input.budgetTl,

    unitPriceTl,

    multiplier:
      input.multiplier ??
      1,

    generatedAt:
      new Date()
        .toISOString(),

    coupons
  };
}
