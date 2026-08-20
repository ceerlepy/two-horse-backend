import {
  describe,
  expect,
  it
} from "vitest";

import {
  optimizeSixFoldCoupons
} from "../src/coupons/optimizer";

function leg(
  raceNumber: number,
  count = 5
) {
  return {
    raceNumber,
    uncertainty:0.5,
    runners:
      Array.from(
        {length:count},
        (_,index) => ({
          horseNumber:index+1,
          horseName:`H${index+1}`,
          score:100-index*8,
          confidence:0.8
        })
      )
  };
}

describe(
  "global coupon optimizer",
  () => {
    it(
      "stays within budget and maximum dominates",
      () => {
        const coupons =
          optimizeSixFoldCoupons({
            legs:[
              leg(1),
              leg(2),
              leg(3),
              leg(4),
              leg(5),
              leg(6)
            ],
            budgetTl:3000,
            unitPriceTl:1.25
          });

        for (
          const coupon of coupons
        ) {
          expect(
            coupon.totalTl
          ).toBeLessThanOrEqual(
            3000
          );
        }

        const maximum =
          coupons.find(
            item =>
              item.profile ===
              "maximum-coverage"
          )!;

        for (
          const coupon of coupons
        ) {
          expect(
            coupon
              .estimatedSurvivalProbability
          ).toBeLessThanOrEqual(
            maximum
              .estimatedSurvivalProbability +
            1e-9
          );
        }
      }
    );
  }
);
