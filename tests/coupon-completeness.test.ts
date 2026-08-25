import {
  describe,
  expect,
  it
} from "vitest";

import {
  explicitCouponExpectedSelections,
  inspectExplicitCouponCompleteness
} from "../src/experts/coupon-completeness";


describe(
  "coupon explicit completeness",
  () => {
    it(
      "maps duplicated HorseTurk Banko legs to one canonical race",
      () => {
        const expected =
          explicitCouponExpectedSelections(
            `
Altılı ganyan tahmin Kocaeli 25 Ağustos 2026
HorseTurk 1. Altılı Ganyan Tahmin
1.AYAK: 1-5-11-8
6.AYAK: 2 GÖREME BEYİ Banko
HorseTurk 2. Altılı Ganyan Tahmin
4.AYAK: 2 GÖREME BEYİ Banko
`,
            [
              "Ankara",
              "Kocaeli"
            ],
            [
              {
                city:"Kocaeli",
                sixfoldNumber:1,
                raceNumber:1
              },
              {
                city:"Kocaeli",
                sixfoldNumber:2,
                raceNumber:3
              }
            ]
          );


        expect(expected)
          .toHaveLength(1);


        expect(expected[0])
          .toEqual({
            city:"Kocaeli",
            raceNumber:6,
            horseNumber:2,
            label:"banko"
          });


        expect(
          inspectExplicitCouponCompleteness(
            {
              races:[]
            },
            expected
          ).complete
        ).toBe(false);
      }
    );
  }
);
