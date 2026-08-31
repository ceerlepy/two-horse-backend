import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildCouponBudgetLadder,
  COUPON_BUDGET_LADDER_CONFIG,
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
  "buildCouponBudgetLadder",
  () => {
    it(
      "always offers the two fixed entry tiers when affordable, then 4 evenly-spaced tiers up to the max",
      () => {
        const tiers =
          buildCouponBudgetLadder(3000);

        expect(tiers[0]).toBe(500);
        expect(tiers[1]).toBe(750);
        expect(tiers).toHaveLength(6);
        expect(tiers[tiers.length - 1]).toBe(3000);

        // strictly increasing, never exceeds the requested max
        for (let i = 1; i < tiers.length; i++) {
          expect(tiers[i]).toBeGreaterThan(tiers[i - 1]);
        }

        expect(Math.max(...tiers)).toBeLessThanOrEqual(3000);
      }
    );

    it(
      "scales the variable tiers proportionally for a much larger max budget",
      () => {
        const tiers =
          buildCouponBudgetLadder(10000);

        expect(tiers[0]).toBe(500);
        expect(tiers[1]).toBe(750);
        expect(tiers[tiers.length - 1]).toBe(10000);

        for (let i = 1; i < tiers.length; i++) {
          expect(tiers[i]).toBeGreaterThan(tiers[i - 1]);
        }
      }
    );

    it(
      "drops a fixed tier the max budget can't afford",
      () => {
        const tiers =
          buildCouponBudgetLadder(600);

        expect(tiers[0]).toBe(500);
        expect(tiers).not.toContain(750);
        expect(tiers[tiers.length - 1]).toBe(600);
      }
    );

    it(
      "degrades to a single coupon when the max budget is below every fixed tier",
      () => {
        const tiers =
          buildCouponBudgetLadder(300);

        expect(Math.max(...tiers)).toBeLessThanOrEqual(300);
        expect(tiers.length).toBeGreaterThan(0);

        for (let i = 1; i < tiers.length; i++) {
          expect(tiers[i]).toBeGreaterThan(tiers[i - 1]);
        }
      }
    );

    it(
      "never produces a tier at or above the requested max other than the final one",
      () => {
        const tiers =
          buildCouponBudgetLadder(3000);

        for (let i = 0; i < tiers.length - 1; i++) {
          expect(tiers[i]).toBeLessThan(3000);
        }
      }
    );

    it(
      "matches the configured fixed tiers exactly",
      () => {
        expect(
          COUPON_BUDGET_LADDER_CONFIG.fixedTiersTl
        ).toEqual([500, 750]);
      }
    );
  }
);


describe(
  "six-fold optimizer",
  () => {
    it(
      "never exceeds its own tier's budget, and the top tier never exceeds the requested max",
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
        ).toHaveLength(6);

        for (
          const coupon of coupons
        ) {
          expect(
            coupon.totalTl
          ).toBeLessThanOrEqual(
            coupon.budgetTl
          );
        }

        expect(
          Math.max(
            ...coupons.map(c => c.budgetTl)
          )
        ).toBeLessThanOrEqual(3000);
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
      "can select more than five horses at the top budget tier",
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

        const topTier =
          coupons.reduce(
            (best, item) =>
              item.budgetTl > best.budgetTl
                ? item
                : best
          );

        expect(
          Math.max(
            ...topTier
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
      "each successive budget tier spends at least as much as the one before it",
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

        for (
          let i = 1;
          i < coupons.length;
          i += 1
        ) {
          expect(
            coupons[i].totalTl
          ).toBeGreaterThanOrEqual(
            coupons[i - 1].totalTl
          );
        }
      }
    );
  }
);
