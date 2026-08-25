import {
  describe,
  expect,
  it
} from "vitest";

import type {
  RawExpertExtraction
} from "../src/experts/raw-extraction";

import {
  filterRawToExplicitAnchors
} from "../src/experts/explicit-anchor-filter";


describe(
  "explicit expert anchor filter",
  () => {
    it(
      "keeps HorseTurk canonical banko and drops bare-grid duplicate",
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
                    horseName:"Göreme Beyi",
                    labels:[
                      "banko"
                    ]
                  }
                ],
                numberGroups:[]
              },
              {
                city:"Kocaeli",
                raceNumber:6,
                selections:[
                  {
                    horseNumber:2,
                    horseName:"Göreme Beyi",
                    labels:[
                      "banko"
                    ]
                  }
                ],
                numberGroups:[]
              }
            ]
          };


        const filtered =
          filterRawToExplicitAnchors(
            raw,
            [
              {
                city:"Kocaeli",
                raceNumber:6,
                horseNumber:2,
                label:"banko"
              }
            ]
          );


        expect(
          filtered.value.races
        ).toHaveLength(1);


        expect(
          filtered
            .value
            .races[0]
            .raceNumber
        ).toBe(6);


        expect(
          filtered
            .value
            .races[0]
            .selections[0]
            .horseNumber
        ).toBe(2);
      }
    );
  }
);
