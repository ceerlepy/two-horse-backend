import {
  describe,
  expect,
  it
} from "vitest";

import {
  inspectAfaCompleteness
} from "../src/experts/afa-completeness";


describe(
  "AFA article completeness",
  () => {
    it(
      "requires every explicit race heading returned by source",
      () => {
        const result =
          inspectAfaCompleteness(
            {
              races:[
                {
                  city:
                    "Ankara",
                  raceNumber:
                    1,
                  selections:[
                    {
                      horseNumber:
                        2,
                      labels:[
                        "favorite"
                      ]
                    }
                  ],
                  numberGroups:[]
                }
              ]
            },
            "1. Koşu analiz. 2. Koşu analiz.",
            [
              "Ankara"
            ]
          );


        expect(
          result.complete
        ).toBe(
          false
        );


        expect(
          result.missing
        ).toEqual([
          2
        ]);
      }
    );
  }
);
