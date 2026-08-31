export type CouponBudget = number;

export type ExpansionLevel =
  | "very-tight"
  | "tight"
  | "balanced"
  | "wide"
  | "very-wide";

export interface CouponBudgetPolicy {
  budgetTl: number;
  expansionLevel: ExpansionLevel;

  allowSingleBankerVariant: boolean;
  allowDoubleBankerVariant: boolean;
}

export interface CouponCostInput {
  selectionsPerLeg: number[];
  unitPriceTl: number;
  multiplier?: number;
}

export interface CouponCost {
  combinations: number;
  unitPriceTl: number;
  multiplier: number;
  totalTl: number;
}

export interface SixFoldPriceOptions {
  city?: string | null;
  isForeign?: boolean;
}

export function sixFoldUnitPrice(
  options: SixFoldPriceOptions = {}
): number {
  if (options.isForeign) {
    return 1;
  }

  const normalized =
    (options.city ?? "")
      .trim()
      .toLocaleLowerCase("tr-TR");

  const oneTlCities =
    new Set([
      "diyarbakır",
      "elazığ",
      "şanlıurfa"
    ]);

  return oneTlCities.has(normalized)
    ? 1
    : 1.25;
}

/*
 * TJK does not publish a separately-listed combination price for
 * Beşli Ganyan anywhere this codebase could find (no rules/pricing
 * page for it was locatable during implementation). This reuses
 * Altılı Ganyan's real published per-combination price as the best
 * available estimate, since TJK's Ganyan-family pools have
 * historically shared a base unit -- but it is NOT independently
 * confirmed for this specific pool. Treat any total shown for a
 * Beşli coupon as provisional until TJK's real 5'Lİ Ganyan price is
 * confirmed and this is corrected if it differs.
 */
export function fiveFoldUnitPrice(
  options: SixFoldPriceOptions = {}
): number {
  return sixFoldUnitPrice(options);
}

export function calculateCouponCost(
  input: CouponCostInput
): CouponCost {
  if (
    !Array.isArray(
      input.selectionsPerLeg
    ) ||
    input.selectionsPerLeg.length === 0
  ) {
    throw new Error(
      "INVALID_SELECTIONS"
    );
  }

  if (
    input.selectionsPerLeg.some(
      count =>
        !Number.isInteger(count) ||
        count < 1
    )
  ) {
    throw new Error(
      "INVALID_SELECTION_COUNT"
    );
  }

  if (
    !Number.isFinite(
      input.unitPriceTl
    ) ||
    input.unitPriceTl <= 0
  ) {
    throw new Error(
      "INVALID_UNIT_PRICE"
    );
  }

  const multiplier =
    input.multiplier ?? 1;

  if (
    !Number.isInteger(multiplier) ||
    multiplier < 1
  ) {
    throw new Error(
      "INVALID_MULTIPLIER"
    );
  }

  const combinations =
    input.selectionsPerLeg.reduce(
      (product, count) =>
        product * count,
      1
    );

  const totalTl =
    combinations *
    input.unitPriceTl *
    multiplier;

  return {
    combinations,
    unitPriceTl:
      input.unitPriceTl,
    multiplier,
    totalTl:
      Number(
        totalTl.toFixed(2)
      )
  };
}
