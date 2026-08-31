import {
  describe,
  expect,
  it
} from "vitest";

import {
  resolveFiveFoldWindows
} from "../src/coupons/windows";


describe(
  "fivefold windows",
  () => {
    it(
      "prefers explicit TJK starts",
      () => {
        const windows =
          resolveFiveFoldWindows(
            [
              1,2,3,4,5,
              6,7,8,9
            ],
            [
              {
                fivefold: 1,
                startRace: 2
              },
              {
                fivefold: 2,
                startRace: 5
              }
            ]
          );

        expect(
          windows
        ).toEqual([
          {
            fivefold: 1,
            startRace: 2,
            endRace: 6,
            raceNumbers:
              [2,3,4,5,6],
            source:
              "tjk-program"
          },
          {
            fivefold: 2,
            startRace: 5,
            endRace: 9,
            raceNumbers:
              [5,6,7,8,9],
            source:
              "tjk-program"
          }
        ]);
      }
    );


    it(
      "falls back when metadata is absent",
      () => {
        const windows =
          resolveFiveFoldWindows(
            [
              1,2,3,4,
              5,6,7
            ]
          );

        expect(
          windows
        ).toEqual([
          {
            fivefold: 1,
            startRace: 1,
            endRace: 5,
            raceNumbers:
              [1,2,3,4,5],
            source:
              "canonical-program"
          },
          {
            fivefold: 2,
            startRace: 3,
            endRace: 7,
            raceNumbers:
              [3,4,5,6,7],
            source:
              "canonical-program"
          }
        ]);
      }
    );


    it(
      "returns nothing below the 5-race minimum",
      () => {
        expect(
          resolveFiveFoldWindows([1,2,3])
        ).toEqual([]);
      }
    );
  }
);
