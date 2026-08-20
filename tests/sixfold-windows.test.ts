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
      "resolves an eight-race card",
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
              [1,2,3,4,5,6]
          },
          {
            sixfold: 2,
            startRace: 3,
            endRace: 8,
            raceNumbers:
              [3,4,5,6,7,8]
          }
        ]);
      }
    );

    it(
      "returns only one window for six races",
      () => {
        const windows =
          resolveSixFoldWindows(
            [1,2,3,4,5,6]
          );

        expect(
          windows
        ).toHaveLength(1);
      }
    );
  }
);
