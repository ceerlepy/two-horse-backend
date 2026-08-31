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
  sixFoldUnitPrice,
  fiveFoldUnitPrice
} from "./types";

import {
  optimizeSixFoldCoupons
} from "./optimizer";

import {
  resolveSixFoldWindows,
  resolveFiveFoldWindows
} from "./windows";

import {
  persistSixFoldCoupons,
  upsertSixFoldWindows,
  persistFiveFoldCoupons,
  upsertFiveFoldWindows
} from "./repository";

import {
  currentSixFoldTemperature,
  currentFiveFoldTemperature
} from "./calibration";


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

    persistSnapshot?: boolean;
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

  const explicitStarts =
    races.flatMap(
      (race:any) => {
        let values:
          unknown = [];

        try {
          values =
            JSON.parse(
              String(
                race
                  .sixfold_start_numbers_json ??
                "[]"
              )
            );
        } catch {
          values = [];
        }

        if (
          !Array.isArray(values)
        ) {
          return [];
        }

        return values
          .map(Number)
          .filter(
            value =>
              value === 1 ||
              value === 2
          )
          .map(
            sixfoldNumber => ({
              sixfold:
                sixfoldNumber,
              startRace:
                Number(
                  race.race_number
                )
            })
          );
      }
    );

  const windows =
    resolveSixFoldWindows(
      races.map(
        (race:any) =>
          Number(
            race.race_number
          )
      ),
      explicitStarts
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

  const temperature =
    await currentSixFoldTemperature(
      env
    );

  const coupons =
    optimizeSixFoldCoupons({
      legs,

      budgetTl:
        input.budgetTl,

      unitPriceTl,

      multiplier:
        input.multiplier ??
        1,

      temperature
    });

  let snapshotPersisted =
    false;

  let snapshotPersistenceReason =
    input.persistSnapshot
      ? "not-evaluated"
      : "read-only-request";

  if (input.persistSnapshot) {
    const now =
      Date.now();

    const starts =
      selectedRaces.map(
        (race:any) => {
          if (!race.starts_at) {
            return null;
          }

          const value =
            Date.parse(
              String(
                race.starts_at
              )
            );

          return Number.isFinite(value)
            ? value
            : null;
        }
      );

    const allStartsKnown =
      starts.every(
        value =>
          value != null
      );

    const allStillFuture =
      allStartsKnown &&
      starts.every(
        value =>
          Number(value) > now
      );

    if (!allStartsKnown) {
      snapshotPersistenceReason =
        "missing-start-time";
    } else if (!allStillFuture) {
      snapshotPersistenceReason =
        "race-already-started";
    } else {
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

      snapshotPersisted =
        true;

      snapshotPersistenceReason =
        "pre-race-frozen";
    }
  }

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

    snapshotPersisted,

    snapshotPersistenceReason,

    coupons
  };
}


/*
 * Beşli Ganyan (5-leg) mirror of generateSixFoldCoupons above.
 */
export async function generateFiveFoldCoupons(
  env: Env,
  input: {
    city: string;

    budgetTl: number;

    fivefold?: number;

    multiplier?: number;

    persistSnapshot?: boolean;
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
    races.length < 5
  ) {
    throw new Error(
      "NOT_ENOUGH_RACES_FOR_FIVE_FOLD"
    );
  }

  const fivefold =
    input.fivefold ??
    1;

  if (
    fivefold !== 1 &&
    fivefold !== 2
  ) {
    throw new Error(
      "INVALID_FIVEFOLD_NUMBER"
    );
  }

  const raceDate =
    turkeyDate();

  const explicitStarts =
    races.flatMap(
      (race:any) => {
        let values:
          unknown = [];

        try {
          values =
            JSON.parse(
              String(
                race
                  .fivefold_start_numbers_json ??
                "[]"
              )
            );
        } catch {
          values = [];
        }

        if (
          !Array.isArray(values)
        ) {
          return [];
        }

        return values
          .map(Number)
          .filter(
            value =>
              value === 1 ||
              value === 2
          )
          .map(
            fivefoldNumber => ({
              fivefold:
                fivefoldNumber,
              startRace:
                Number(
                  race.race_number
                )
            })
          );
      }
    );

  const windows =
    resolveFiveFoldWindows(
      races.map(
        (race:any) =>
          Number(
            race.race_number
          )
      ),
      explicitStarts
    );

  await upsertFiveFoldWindows(
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
        item.fivefold ===
        fivefold
    );

  if (!window) {
    throw new Error(
      "FIVE_FOLD_WINDOW_NOT_AVAILABLE"
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
    selectedRaces.length !== 5
  ) {
    throw new Error(
      "FIVE_FOLD_WINDOW_NOT_AVAILABLE"
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
    fiveFoldUnitPrice({
      city:
        String(
          meeting.city
        )
    });

  const temperature =
    await currentFiveFoldTemperature(
      env
    );

  const coupons =
    optimizeSixFoldCoupons({
      legs,

      budgetTl:
        input.budgetTl,

      unitPriceTl,

      multiplier:
        input.multiplier ??
        1,

      temperature
    });

  let snapshotPersisted =
    false;

  let snapshotPersistenceReason =
    input.persistSnapshot
      ? "not-evaluated"
      : "read-only-request";

  if (input.persistSnapshot) {
    const now =
      Date.now();

    const starts =
      selectedRaces.map(
        (race:any) => {
          if (!race.starts_at) {
            return null;
          }

          const value =
            Date.parse(
              String(
                race.starts_at
              )
            );

          return Number.isFinite(value)
            ? value
            : null;
        }
      );

    const allStartsKnown =
      starts.every(
        value =>
          value != null
      );

    const allStillFuture =
      allStartsKnown &&
      starts.every(
        value =>
          Number(value) > now
      );

    if (!allStartsKnown) {
      snapshotPersistenceReason =
        "missing-start-time";
    } else if (!allStillFuture) {
      snapshotPersistenceReason =
        "race-already-started";
    } else {
      await persistFiveFoldCoupons(
        env,
        {
          raceDate,
          city:
            String(
              meeting.city
            ),
          fivefold,
          startRace:
            window.startRace,
          endRace:
            window.endRace,
          coupons
        }
      );

      snapshotPersisted =
        true;

      snapshotPersistenceReason =
        "pre-race-frozen";
    }
  }

  return {
    date:
      raceDate,

    city:
      meeting.city,

    fivefold,

    startRace:
      Number(
        selectedRaces[0]
          .race_number
      ),

    endRace:
      Number(
        selectedRaces[4]
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

    snapshotPersisted,

    snapshotPersistenceReason,

    coupons
  };
}
