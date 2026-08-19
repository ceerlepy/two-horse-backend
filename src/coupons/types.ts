export type CouponBudget =
  | 100
  | 300
  | 1000
  | 3000;

export type ExpansionLevel =
  | "very-tight"
  | "tight"
  | "balanced"
  | "wide";

export interface CouponBudgetPolicy {
  budgetTl: CouponBudget;

  expansionLevel:
    ExpansionLevel;

  allowSingleBankerVariant:
    boolean;

  allowDoubleBankerVariant:
    boolean;
}
