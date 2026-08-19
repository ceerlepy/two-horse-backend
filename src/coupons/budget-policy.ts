import type {
  CouponBudget,
  CouponBudgetPolicy
} from "./types";

export const
COUPON_BUDGET_POLICIES:
Record<
  CouponBudget,
  CouponBudgetPolicy
> = {
  100: {
    budgetTl: 100,
    expansionLevel:
      "very-tight",

    allowSingleBankerVariant:
      true,

    allowDoubleBankerVariant:
      false
  },

  300: {
    budgetTl: 300,
    expansionLevel:
      "tight",

    allowSingleBankerVariant:
      true,

    allowDoubleBankerVariant:
      false
  },

  1000: {
    budgetTl: 1000,
    expansionLevel:
      "balanced",

    allowSingleBankerVariant:
      true,

    allowDoubleBankerVariant:
      true
  },

  3000: {
    budgetTl: 3000,
    expansionLevel:
      "wide",

    allowSingleBankerVariant:
      true,

    allowDoubleBankerVariant:
      true
  }
};

/*
 * Optimizer principle:
 *
 * maximize estimated six-leg survival probability
 * subject to total ticket cost <= requested budget.
 *
 * NOT:
 * maximize number of selected horses.
 *
 * Strong leg:
 *   narrow / single.
 *
 * Uncertain leg:
 *   spend saved combinations here.
 */
export function couponBudgetPolicy(
  budgetTl: CouponBudget
): CouponBudgetPolicy {
  return (
    COUPON_BUDGET_POLICIES[
      budgetTl
    ]
  );
}
