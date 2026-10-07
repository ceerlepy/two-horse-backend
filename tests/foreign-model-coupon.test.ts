import { describe, expect, it } from "vitest";

import {
  buildForeignModelCoupons,
  FOREIGN_MODEL_COUPON_CONFIG
} from "../src/foreign/model-coupon";


/*
 * A meeting shaped like the ones TJK publishes: eight races, the first
 * altılı starting at race 1 and the second at race 3.
 */
function meeting(
  overrides: Record<number, Array<{ number: number; winProb: number | null }>> = {}
) {
  return Array.from({ length: 8 }, (_, index) => {
    const raceNumber = index + 1;
    const starts =
      raceNumber === 1 ? [1] : raceNumber === 3 ? [2] : [];

    return {
      raceNumber,
      time: `1${index}:00`,
      sixfoldStartNumbers: starts,
      runners:
        (overrides[raceNumber] ??
          [
            { number: 1, winProb: 0.40 },
            { number: 2, winProb: 0.25 },
            { number: 3, winProb: 0.20 },
            { number: 4, winProb: 0.15 }
          ]).map(runner => ({
            number: runner.number,
            name: `HORSE ${runner.number}`,
            winProb: runner.winProb
          }))
    };
  });
}


describe("our own altılı for a foreign card", () => {
  it("builds one coupon per altılı window, on the races TJK marks", () => {
    const coupons = buildForeignModelCoupons(meeting());

    expect(coupons.map(coupon => coupon.altili)).toEqual([1, 2]);

    expect(coupons[0].legs.map(leg => leg.raceNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(coupons[1].legs.map(leg => leg.raceNumber)).toEqual([3, 4, 5, 6, 7, 8]);

    /* The window's first race gives the coupon its start time. */
    expect(coupons[0].startTime).toBe("10:00");
    expect(coupons[1].startTime).toBe("12:00");
  });

  it("stays inside the fixed budget and reports what it covers", () => {
    const [coupon] = buildForeignModelCoupons(meeting());

    expect(coupon.amountTl).toBeLessThanOrEqual(
      FOREIGN_MODEL_COUPON_CONFIG.budgetTl
    );
    expect(coupon.combinations).toBe(
      coupon.legs.reduce((product, leg) => product * leg.selection.length, 1)
    );
    expect(coupon.estimatedSurvivalProbability).toBeGreaterThan(0);
    expect(coupon.estimatedSurvivalProbability).toBeLessThan(1);

    for (const leg of coupon.legs) {
      expect(leg.selection.length).toBeGreaterThan(0);
      /* Ascending, as a coupon is read. */
      expect([...leg.selection].sort((a, b) => a - b)).toEqual(leg.selection);
    }
  });

  it("leaves out a horse TJK publishes no AGF for", () => {
    const coupons = buildForeignModelCoupons(
      meeting({
        1: [
          { number: 1, winProb: 0.60 },
          { number: 2, winProb: 0.40 },
          { number: 9, winProb: null }
        ]
      })
    );

    const firstLeg = coupons[0].legs[0];
    expect(firstLeg.selection).not.toContain(9);
  });

  it("drops the whole window when a leg has no priced runner", () => {
    const coupons = buildForeignModelCoupons(
      meeting({
        2: [
          { number: 1, winProb: null },
          { number: 2, winProb: null }
        ]
      })
    );

    /* Race 2 is only in the first window, so the second survives. */
    expect(coupons.map(coupon => coupon.altili)).toEqual([2]);
  });

  it("builds nothing when the page marks no altılı window", () => {
    const races =
      meeting().map(race => ({ ...race, sixfoldStartNumbers: [] }));

    expect(buildForeignModelCoupons(races)).toEqual([]);
  });

  it("builds nothing when the window runs past the last race", () => {
    const races =
      meeting()
        .slice(0, 5)
        .map(race =>
          race.raceNumber === 1
            ? race
            : { ...race, sixfoldStartNumbers: [] }
        );

    expect(buildForeignModelCoupons(races)).toEqual([]);
  });
});
