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
      "keeps coupon legs outside expert extraction",
      () => {
        const prompt =
          expertExtractionPrompt(
            "Test Source"
          );


        expect(prompt)
          .toContain(
            "ALTILI GANYAN"
          );


        expect(prompt)
          .toContain(
            "1.Ayak:"
          );


        expect(prompt)
          .toContain(
            'labels=["rival"]'
          );
      }
    );


    it(
      "maps compact semantic labels into domain flags",
      () => {
        const mapped =
          mapRawExpertExtraction({
            picks: [
              {
                city:
                  "İstanbul",

                raceNumber:
                  5,

                horseNumber:
                  1,

                horseName:
                  "PRANDELLO",

                comment:
                  "birinciliğin en güçlü adayıdır",

                labels: [
                  "favorite",
                  "strong"
                ]
              },

              {
                city:
                  "İstanbul",

                raceNumber:
                  5,

                horseNumber:
                  2,

                horseName:
                  null,

                comment:
                  null,

                labels: [
                  "rival"
                ]
              }
            ]
          });


        expect(
          mapped.picks
        ).toHaveLength(2);


        expect(
          mapped.picks[0]
            .isFavorite
        ).toBe(true);


        expect(
          mapped.picks[0]
            .isStrong
        ).toBe(true);


        expect(
          mapped.picks[1]
            .isRival
        ).toBe(true);


        expect(
          mapped.picks[1]
            .horseName
        ).toBeNull();


        expect(
          mapped.picks[1]
            .confidence
        ).toBeGreaterThan(0);
      }
    );


    it(
      "preserves output order under bounded concurrency",
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
              value * 10
          );


        expect(values)
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
