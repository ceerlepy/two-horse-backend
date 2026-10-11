import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildCouponBands,
  COUPON_BAND_CONFIG,
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


describe("buildCouponBands", () => {
  it("cuts the max budget into 500 TL bands", () => {
    expect(buildCouponBands(2000)).toEqual([
      { minTl: 0, maxTl: 500 },
      { minTl: 500, maxTl: 1000 },
      { minTl: 1000, maxTl: 1500 },
      { minTl: 1500, maxTl: 2000 }
    ]);
  });

  it("ends the last band at an uneven max", () => {
    expect(buildCouponBands(1200).at(-1)).toEqual({ minTl: 1000, maxTl: 1200 });
    expect(buildCouponBands(300)).toEqual([{ minTl: 0, maxTl: 300 }]);
  });

  it("gives Gold's 1000 TL two coupons and 5000 TL ten", () => {
    expect(buildCouponBands(1000)).toHaveLength(2);
    expect(buildCouponBands(5000)).toHaveLength(10);
  });

  it("matches the configured rules", () => {
    expect(COUPON_BAND_CONFIG.stepTl).toBe(500);
    expect(COUPON_BAND_CONFIG.nestedUpToTl).toBe(2000);
  });
});

describe("band coupons", () => {
  const legs = () => [1, 2, 3, 4, 5, 6].map(n => leg(n, 10, 0.5));

  it("keeps each coupon inside its band and nests them up to 2000 TL", () => {
    const coupons =
      optimizeSixFoldCoupons({ legs: legs(), budgetTl: 3000, unitPriceTl: 1.25 });

    for (const coupon of coupons) {
      expect(coupon.totalTl).toBeLessThanOrEqual(coupon.targetBudgetTl + 1e-9);
      expect(coupon.totalTl).toBeGreaterThanOrEqual(
        Math.max(coupon.bandMinTl, COUPON_BAND_CONFIG.minTicketTl) - 1e-9
      );
    }

    const nested = coupons.filter(c => c.targetBudgetTl <= 2000);

    for (let i = 1; i < nested.length; i++) {
      nested[i].legs.forEach((selection, index) => {
        expect(selection.horses.length)
          .toBeGreaterThanOrEqual(nested[i - 1].legs[index].horses.length);
      });
    }
  });

  it("never prices a coupon below TJK's minimum stake", () => {
    const coupons =
      optimizeSixFoldCoupons({ legs: legs(), budgetTl: 500, unitPriceTl: 1.25 });

    expect(coupons).toHaveLength(1);
    expect(coupons[0].totalTl).toBeGreaterThanOrEqual(COUPON_BAND_CONFIG.minTicketTl);
    expect(coupons[0].totalTl).toBeLessThanOrEqual(500);
  });
});


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
