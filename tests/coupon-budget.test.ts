import {
  describe,
  expect,
  it
} from "vitest";

import {
  calculateCouponCost,
  sixFoldUnitPrice
} from "../src/coupons/types";

import {
  couponBudgetPolicy
} from "../src/coupons/budget-policy";

describe(
  "coupon budget",
  () => {
    it(
      "accepts arbitrary budgets",
      () => {
        expect(
          couponBudgetPolicy(
            157
          ).budgetTl
        ).toBe(157);

        expect(
          couponBudgetPolicy(
            725
          ).budgetTl
        ).toBe(725);

        expect(
          couponBudgetPolicy(
            4875
          ).budgetTl
        ).toBe(4875);
      }
    );

    it(
      "calculates combinations",
      () => {
        const result =
          calculateCouponCost({
            selectionsPerLeg: [
              1,
              2,
              3,
              2,
              4,
              2
            ],
            unitPriceTl: 1.25
          });

        expect(
          result.combinations
        ).toBe(96);

        expect(
          result.totalTl
        ).toBe(120);
      }
    );

    it(
      "supports multiplier",
      () => {
        const result =
          calculateCouponCost({
            selectionsPerLeg: [
              1,
              2,
              3,
              2,
              4,
              2
            ],
            unitPriceTl: 1.25,
            multiplier: 2
          });

        expect(
          result.totalTl
        ).toBe(240);
      }
    );

    it(
      "uses Elazig unit price",
      () => {
        expect(
          sixFoldUnitPrice({
            city: "Elazığ"
          })
        ).toBe(1);
      }
    );

    it(
      "uses standard unit price",
      () => {
        expect(
          sixFoldUnitPrice({
            city: "İstanbul"
          })
        ).toBe(1.25);
      }
    );
  }
);
