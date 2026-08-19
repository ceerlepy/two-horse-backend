import {
  describe,
  expect,
  it
} from "vitest";

import {
  optimizeSixFoldCoupons
} from "../src/coupons/optimizer";


function leg(
  raceNumber:
    number,
  count = 10,
  uncertainty = 0.5
) {
  return {
    raceNumber,

    uncertainty,

    runners:
      Array.from(
        {
          length: count
        },
        (_, index) => ({
          horseNumber:
            index + 1,

          horseName:
            `H${index + 1}`,

          score:
            90 -
            index * 5,

          confidence:
            0.75
        })
      )
  };
}


describe(
  "six-fold optimizer",
  () => {
    it(
      "never exceeds budget",
      () => {
        const coupons =
          optimizeSixFoldCoupons({
            legs:
              [
                leg(1),
                leg(2),
                leg(3),
                leg(4),
                leg(5),
                leg(6)
              ],

            budgetTl:
              3000,

            unitPriceTl:
              1.25
          });

        expect(
          coupons
        ).toHaveLength(3);

        for (
          const coupon of coupons
        ) {
          expect(
            coupon.totalTl
          ).toBeLessThanOrEqual(
            3000
          );
        }
      }
    );


    it(
      "returns six legs",
      () => {
        const coupons =
          optimizeSixFoldCoupons({
            legs:
              [
                leg(1),
                leg(2),
                leg(3),
                leg(4),
                leg(5),
                leg(6)
              ],

            budgetTl:
              500,

            unitPriceTl:
              1.25
          });

        for (
          const coupon of coupons
        ) {
          expect(
            coupon.legs
          ).toHaveLength(6);
        }
      }
    );


    it(
      "can select more than five horses",
      () => {
        const coupons =
          optimizeSixFoldCoupons({
            legs:
              [
                leg(
                  1,
                  14,
                  1
                ),

                leg(
                  2,
                  3,
                  0.1
                ),

                leg(
                  3,
                  3,
                  0.1
                ),

                leg(
                  4,
                  3,
                  0.1
                ),

                leg(
                  5,
                  3,
                  0.1
                ),

                leg(
                  6,
                  3,
                  0.1
                )
              ],

            budgetTl:
              20000,

            unitPriceTl:
              1
          });

        const maximum =
          coupons.find(
            item =>
              item.profile ===
              "maximum-coverage"
          )!;

        expect(
          Math.max(
            ...maximum
              .legs
              .map(
                item =>
                  item
                    .horses
                    .length
              )
          )
        ).toBeGreaterThan(5);
      }
    );


    it(
      "larger profile does not spend less by design",
      () => {
        const coupons =
          optimizeSixFoldCoupons({
            legs:
              [
                leg(1),
                leg(2),
                leg(3),
                leg(4),
                leg(5),
                leg(6)
              ],

            budgetTl:
              3000,

            unitPriceTl:
              1.25
          });

        const cautious =
          coupons[0];

        const balanced =
          coupons[1];

        const maximum =
          coupons[2];

        expect(
          balanced.totalTl
        ).toBeGreaterThanOrEqual(
          cautious.totalTl
        );

        expect(
          maximum.totalTl
        ).toBeGreaterThanOrEqual(
          balanced.totalTl
        );
      }
    );
  }
);
