import type {
  CouponBudget,
  CouponBudgetPolicy
} from "./types";

export function couponBudgetPolicy(
  budgetTl: CouponBudget
): CouponBudgetPolicy {
  if (
    !Number.isFinite(budgetTl) ||
    budgetTl <= 0
  ) {
    throw new Error(
      "INVALID_COUPON_BUDGET"
    );
  }

  if (budgetTl <= 100) {
    return {
      budgetTl,
      expansionLevel:
        "very-tight",
      allowSingleBankerVariant:
        true,
      allowDoubleBankerVariant:
        false
    };
  }

  if (budgetTl <= 300) {
    return {
      budgetTl,
      expansionLevel:
        "tight",
      allowSingleBankerVariant:
        true,
      allowDoubleBankerVariant:
        false
    };
  }

  if (budgetTl <= 1000) {
    return {
      budgetTl,
      expansionLevel:
        "balanced",
      allowSingleBankerVariant:
        true,
      allowDoubleBankerVariant:
        true
    };
  }

  if (budgetTl <= 3000) {
    return {
      budgetTl,
      expansionLevel:
        "wide",
      allowSingleBankerVariant:
        true,
      allowDoubleBankerVariant:
        true
    };
  }

  return {
    budgetTl,
    expansionLevel:
      "very-wide",
    allowSingleBankerVariant:
      true,
    allowDoubleBankerVariant:
      true
  };
}
