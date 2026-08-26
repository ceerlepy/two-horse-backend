import {
  describe,
  expect,
  it
} from "vitest";

import {
  resolveCanonicalRunnerForPick
} from "../src/experts/validator";


describe(
  "expert canonical identity",
  () => {
    const runners=[
      {
        city:"Ankara",
        raceNumber:1,
        horseNumber:12,
        horseName:"CANELÇİN"
      },
      {
        city:"Ankara",
        raceNumber:2,
        horseNumber:4,
        horseName:"İZGİOĞLU"
      }
    ];

    it(
      "can correct only horse number inside the same race",
      () => {
        const result =
          resolveCanonicalRunnerForPick(
            runners,
            {
              city:"Ankara",
              raceNumber:1,
              horseNumber:99,
              horseName:"CANELÇİN"
            }
          );

        expect(
          result?.method
        ).toBe(
          "same-race-name"
        );

        expect(
          result?.runner.horseNumber
        ).toBe(12);
      }
    );

    it(
      "never moves a horse to another race",
      () => {
        const result =
          resolveCanonicalRunnerForPick(
            runners,
            {
              city:"Ankara",
              raceNumber:1,
              horseNumber:99,
              horseName:"İZGİOĞLU"
            }
          );

        expect(result).toBeNull();
      }
    );
  }
);
