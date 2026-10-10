import { describe, expect, it } from "vitest";

import { optimizeSixFoldCoupons, type CouponLegInput } from "../src/coupons/optimizer";

function leg(raceNumber: number, probabilities: number[], forcedHorseNumber: number | null = null): CouponLegInput {
  return {
    raceNumber,
    uncertainty: 0.5,
    forcedHorseNumber,
    runners: probabilities.map((p, i) => ({
      horseNumber: i + 1,
      score: 100 - i,
      confidence: 1,
      winProbability: p
    }))
  };
}

const field = [0.4, 0.25, 0.15, 0.1, 0.06, 0.04];

describe("risk sever coupon", () => {
  it("keeps the forced surprise on every budget tier", () => {
    const legs = [
      leg(1, field, 6),
      leg(2, field),
      leg(3, field),
      leg(4, field, 5),
      leg(5, field),
      leg(6, field)
    ];

    const coupons = optimizeSixFoldCoupons({ legs, budgetTl: 1000, unitPriceTl: 1.25 });

    expect(coupons.length).toBeGreaterThan(0);

    for (const coupon of coupons) {
      const numbers = coupon.legs.map(l => l.horses.map(h => h.horseNumber));
      expect(numbers[0]).toContain(6);
      expect(numbers[0]).toContain(1);
      expect(numbers[3]).toContain(5);
      expect(coupon.totalTl).toBeLessThanOrEqual(coupon.budgetTl + 1e-9);
    }
  });

  it("changes nothing without a forced horse", () => {
    const legs = [1, 2, 3, 4, 5, 6].map(n => leg(n, field));
    const plain = optimizeSixFoldCoupons({ legs, budgetTl: 500, unitPriceTl: 1.25 });
    const nulls = optimizeSixFoldCoupons({ legs: legs.map(l => ({ ...l, forcedHorseNumber: null })), budgetTl: 500, unitPriceTl: 1.25 });
    expect(nulls).toEqual(plain);
  });
});
