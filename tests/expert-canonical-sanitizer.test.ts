import {
  describe,
  expect,
  it
} from "vitest";

import type {
  RawExpertExtraction
} from "../src/experts/raw-extraction";

import {
  sanitizeRawAgainstCanonical
} from "../src/experts/canonical-raw-sanitizer";


describe(
  "canonical raw expert sanitizer",
  () => {
    it(
      "repairs unique horse identity and drops unresolvable AI noise",
      () => {
        const raw:
          RawExpertExtraction = {
            races:[
              {
                city:"Kocaeli",
                raceNumber:3,
                selections:[
                  {
                    horseNumber:2,
                    horseName:"GÖREME BEYİ",
                    labels:[
                      "banko"
                    ]
                  },
                  {
                    horseNumber:99,
                    horseName:null,
                    labels:[
                      "rival"
                    ]
                  }
                ],
                numberGroups:[]
              }
            ]
          };


        const result =
          sanitizeRawAgainstCanonical(
            raw,
            [
              {
                city:"Kocaeli",
                raceNumber:6,
                horseNumber:2,
                horseName:"GÖREME BEYİ"
              }
            ]
          );


        expect(
          result
            .value
            .races
        ).toHaveLength(1);


        expect(
          result
            .value
            .races[0]
            .raceNumber
        ).toBe(6);


        expect(
          result
            .diagnostics
            .repairedCount
        ).toBe(1);


        expect(
          result
            .diagnostics
            .droppedCount
        ).toBe(1);
      }
    );
  }
);
