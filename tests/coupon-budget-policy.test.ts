import {
  describe,
  expect,
  it
} from "vitest";

import {
  couponBudgetPolicy
} from "../src/coupons/budget-policy";

describe(
  "coupon budget policy",
  () => {
    it(
      "supports 100 300 1000 and 3000 TL",
      () => {
        expect(
          couponBudgetPolicy(100)
            .budgetTl
        ).toBe(100);

        expect(
          couponBudgetPolicy(300)
            .budgetTl
        ).toBe(300);

        expect(
          couponBudgetPolicy(1000)
            .budgetTl
        ).toBe(1000);

        expect(
          couponBudgetPolicy(3000)
            .budgetTl
        ).toBe(3000);
      }
    );

    it(
      "enables double-banker variants only for larger budgets",
      () => {
        expect(
          couponBudgetPolicy(100)
            .allowDoubleBankerVariant
        ).toBe(false);

        expect(
          couponBudgetPolicy(300)
            .allowDoubleBankerVariant
        ).toBe(false);

        expect(
          couponBudgetPolicy(1000)
            .allowDoubleBankerVariant
        ).toBe(true);

        expect(
          couponBudgetPolicy(3000)
            .allowDoubleBankerVariant
        ).toBe(true);
      }
    );
  }
);
