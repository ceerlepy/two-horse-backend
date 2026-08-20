import {
  describe,
  expect,
  it
} from "vitest";

import {
  resolveSixFoldWindows
} from "../src/coupons/windows";


describe(
  "sixfold windows",
  () => {
    it(
      "prefers explicit TJK starts",
      () => {
        const windows =
          resolveSixFoldWindows(
            [
              1,2,3,4,5,
              6,7,8,9
            ],
            [
              {
                sixfold: 1,
                startRace: 2
              },
              {
                sixfold: 2,
                startRace: 4
              }
            ]
          );

        expect(
          windows
        ).toEqual([
          {
            sixfold: 1,
            startRace: 2,
            endRace: 7,
            raceNumbers:
              [2,3,4,5,6,7],
            source:
              "tjk-program"
          },
          {
            sixfold: 2,
            startRace: 4,
            endRace: 9,
            raceNumbers:
              [4,5,6,7,8,9],
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
          resolveSixFoldWindows(
            [
              1,2,3,4,
              5,6,7,8
            ]
          );

        expect(
          windows
        ).toEqual([
          {
            sixfold: 1,
            startRace: 1,
            endRace: 6,
            raceNumbers:
              [1,2,3,4,5,6],
            source:
              "canonical-program"
          },
          {
            sixfold: 2,
            startRace: 3,
            endRace: 8,
            raceNumbers:
              [3,4,5,6,7,8],
            source:
              "canonical-program"
          }
        ]);
      }
    );
  }
);
