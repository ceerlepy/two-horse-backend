import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertExtractionPrompt
} from "../src/experts/prompt";

import {
  mapRawExpertExtraction
} from "../src/experts/raw-extraction";

import {
  mapLimit
} from "../src/experts/concurrency";


describe(
  "expert pipeline architecture",
  () => {
    it(
      "keeps coupon legs outside extraction",
      () => {
        const prompt =
          expertExtractionPrompt(
            "Test Source"
          );


        expect(
          prompt
        )
          .toContain(
            "ALTILI GANYAN"
          );


        expect(
          prompt
        )
          .toContain(
            "numberGroups"
          );
      }
    );


    it(
      "expands compact number groups into separate horse-level picks",
      () => {
        const mapped =
          mapRawExpertExtraction({
            races: [
              {
                city:
                  "Bursa",

                raceNumber:
                  6,

                selections: [
                  {
                    horseNumber:
                      2,

                    horseName:
                      "BIG HONEY",

                    comment:
                      "kazanmaya yakındır",

                    labels: [
                      "strong"
                    ]
                  }
                ],

                numberGroups: [
                  {
                    label:
                      "rival",

                    horseNumbers: [
                      6,
                      1,
                      8
                    ]
                  }
                ]
              }
            ]
          });


        /*
         * Main horse + 3 rivals.
         *
         * Four separate final horse records.
         */
        expect(
          mapped.picks
        )
          .toHaveLength(
            4
          );


        const bigHoney =
          mapped.picks.find(
            item =>
              item.horseNumber ===
              2
          );


        expect(
          bigHoney?.isStrong
        )
          .toBe(
            true
          );


        for (
          const number of
          [
            6,
            1,
            8
          ]
        ) {
          const rival =
            mapped.picks.find(
              item =>
                item.horseNumber ===
                number
            );


          expect(
            rival?.isRival
          )
            .toBe(
              true
            );


          expect(
            rival?.horseName
          )
            .toBeNull();
        }
      }
    );


    it(
      "merges multiple labels for the same horse",
      () => {
        const mapped =
          mapRawExpertExtraction({
            races: [
              {
                city:
                  "İstanbul",

                raceNumber:
                  5,

                selections: [
                  {
                    horseNumber:
                      1,

                    horseName:
                      "PRANDELLO",

                    labels: [
                      "favorite",
                      "strong"
                    ]
                  }
                ],

                numberGroups: [
                  {
                    label:
                      "rival",

                    horseNumbers: [
                      1
                    ]
                  }
                ]
              }
            ]
          });


        expect(
          mapped.picks
        )
          .toHaveLength(
            1
          );


        expect(
          mapped.picks[0]
            .isFavorite
        )
          .toBe(
            true
          );


        expect(
          mapped.picks[0]
            .isStrong
        )
          .toBe(
            true
          );


        expect(
          mapped.picks[0]
            .isRival
        )
          .toBe(
            true
          );
      }
    );


    it(
      "preserves mapLimit output order",
      async () => {
        const values =
          await mapLimit(
            [
              1,
              2,
              3,
              4
            ],
            2,

            async value =>
              value *
              10
          );


        expect(
          values
        )
          .toEqual(
            [
              10,
              20,
              30,
              40
            ]
          );
      }
    );
  }
);
