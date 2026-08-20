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
  sixFoldUnitPrice
} from "./types";

import {
  optimizeSixFoldCoupons
} from "./optimizer";

import {
  resolveSixFoldWindows
} from "./windows";

import {
  persistSixFoldCoupons,
  upsertSixFoldWindows
} from "./repository";


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


function displayHorseName(
  value:
    string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  return value
    /*
     * TJK programme names can carry a trailing
     * parenthesised age/auxiliary value.
     *
     * BOLD LION (5) -> BOLD LION
     */
    .replace(
      /\s*\(\d+\)\s*$/u,
      ""
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
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

  const raceDate =
    turkeyDate();

  const windows =
    resolveSixFoldWindows(
      races.map(
        (race:any) =>
          Number(
            race.race_number
          )
      )
    );

  await upsertSixFoldWindows(
    env,
    {
      raceDate,
      city:
        String(
          meeting.city
        ),
      windows
    }
  );

  const window =
    windows.find(
      item =>
        item.sixfold ===
        sixfold
    );

  if (!window) {
    throw new Error(
      "SIX_FOLD_WINDOW_NOT_AVAILABLE"
    );
  }

  const selectedRaces =
    window.raceNumbers
      .map(
        raceNumber =>
          races.find(
            (race:any) =>
              Number(
                race.race_number
              ) ===
              raceNumber
          )
      )
      .filter(Boolean);

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
                  displayHorseName(
                    runner
                      .horse_name
                  ),

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

  await persistSixFoldCoupons(
    env,
    {
      raceDate,
      city:
        String(
          meeting.city
        ),
      sixfold,
      startRace:
        window.startRace,
      endRace:
        window.endRace,
      coupons
    }
  );

  return {
    date:
      raceDate,

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
