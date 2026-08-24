import {
  describe,
  expect,
  it
} from "vitest";

import {
  inspectLiderformCompleteness,
  liderformExpectedMainSelections
} from "../src/experts/liderform-completeness";


const article = `
Bursa'da 1400 metre çim pistte yapılacak 9.Koşu olan Maiden yarışta;
(1) SİLUET bugün daha uygun rakipleri arasında birincilikle tanışabilir.
Sırasıyla rakip gördüğümüz isimler: 9-4-5

Elazığ'da 1200 metre kum pistte yapılacak 8.Koşu olan Şartlı-2 yarışta;
(14) SKY TURK gerçek gücünü yansıtarak farklı sonuç elde edebilecek güçtedir.
Sırasıyla rakip gördüğümüz isimler: 7-6-3
`;


describe(
  "Liderform main-selection completeness",
  () => {
    it(
      "detects explicit main anchors from analysis paragraphs",
      () => {
        expect(
          liderformExpectedMainSelections(
            article,
            [
              "Bursa",
              "Elazığ"
            ]
          )
        )
          .toEqual([
            {
              city:
                "Bursa",

              raceNumber:
                9,

              horseNumber:
                1
            },

            {
              city:
                "Elazığ",

              raceNumber:
                8,

              horseNumber:
                14
            }
          ]);
      }
    );


    it(
      "rejects the exact 22-of-24 failure shape",
      () => {
        const result =
          inspectLiderformCompleteness(
            {
              races: [
                {
                  city:
                    "Bursa",

                  raceNumber:
                    9,

                  selections:
                    [],

                  numberGroups: [
                    {
                      label:
                        "rival",

                      horseNumbers:
                        [9,4,5]
                    }
                  ]
                },

                {
                  city:
                    "Elazığ",

                  raceNumber:
                    8,

                  selections:
                    [],

                  numberGroups: [
                    {
                      label:
                        "rival",

                      horseNumbers:
                        [7,6,3]
                    }
                  ]
                }
              ]
            },

            article,

            [
              "Bursa",
              "Elazığ"
            ]
          );


        expect(
          result.complete
        )
          .toBe(
            false
          );


        expect(
          result.missing
        )
          .toEqual([
            {
              city:
                "Bursa",

              raceNumber:
                9,

              horseNumber:
                1,

              reason:
                "main-selection-missing"
            },

            {
              city:
                "Elazığ",

              raceNumber:
                8,

              horseNumber:
                14,

              reason:
                "main-selection-missing"
            }
          ]);
      }
    );


    it(
      "accepts all explicit main selections",
      () => {
        const result =
          inspectLiderformCompleteness(
            {
              races: [
                {
                  city:
                    "Bursa",

                  raceNumber:
                    9,

                  selections: [
                    {
                      horseNumber:
                        1,

                      horseName:
                        "SİLUET",

                      comment:
                        "birincilikle tanışabilir",

                      labels: [
                        "strong"
                      ]
                    }
                  ],

                  numberGroups: [
                    {
                      label:
                        "rival",

                      horseNumbers:
                        [9,4,5]
                    }
                  ]
                },

                {
                  city:
                    "Elazığ",

                  raceNumber:
                    8,

                  selections: [
                    {
                      horseNumber:
                        14,

                      horseName:
                        "SKY TURK",

                      comment:
                        "farklı sonuç elde edebilecek güçtedir",

                      labels: [
                        "strong"
                      ]
                    }
                  ],

                  numberGroups: [
                    {
                      label:
                        "rival",

                      horseNumbers:
                        [7,6,3]
                    }
                  ]
                }
              ]
            },

            article,

            [
              "Bursa",
              "Elazığ"
            ]
          );


        expect(
          result.complete
        )
          .toBe(
            true
          );


        expect(
          result.missing
        )
          .toEqual(
            []
          );
      }
    );
  }
);
