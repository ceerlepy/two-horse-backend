import { describe, expect, it } from "vitest";

import {
  generateForeignSixFoldCoupons
} from "../src/foreign/coupon-service";

import {
  createSqliteD1
} from "./helpers/sqlite-d1";


const RACE_DATE = "2026-10-07";
const CITY = "Keeneland ABD";


/*
 * Eight races as TJK publishes a foreign card: the first altılı starts
 * at race 1, the second at race 3.
 */
function races() {
  return Array.from({ length: 8 }, (_, index) => {
    const raceNumber = index + 1;

    return {
      raceNumber,
      time: `${10 + index}:00`,
      distanceMeters: 1600,
      track: "Kum",
      sixfoldStartNumbers:
        raceNumber === 1 ? [1] : raceNumber === 3 ? [2] : [],
      runners: [40, 25, 20, 15].map((agfPercent, i) => ({
        number: i + 1,
        name: `HORSE ${i + 1}`,
        jockey: null,
        weight: null,
        agfPercent,
        recentForm: null
      }))
    };
  });
}

async function envWithMeeting(program: unknown = races()) {
  const env: any = { DB: createSqliteD1(["migrations/0034_foreign_meetings.sql"]) };

  await env.DB.prepare("INSERT INTO foreign_meetings VALUES (?,?,?,?,?,?,?)")
    .bind(
      RACE_DATE, CITY, "ABD", 4,
      JSON.stringify(program), "https://x", `${RACE_DATE}T10:00:00Z`
    )
    .run();

  return env;
}


describe("a foreign meeting's altılı at the user's own budget", () => {
  it("builds the window TJK marks, within the budget", async () => {
    const env = await envWithMeeting();

    const result =
      await generateForeignSixFoldCoupons(env, {
        city: CITY,
        budgetTl: 750,
        sixfold: 2,
        raceDate: RACE_DATE
      });

    expect(result.city).toBe(CITY);
    expect(result.date).toBe(RACE_DATE);
    expect(result.sixfold).toBe(2);
    expect(result.startRace).toBe(3);
    expect(result.endRace).toBe(8);
    expect(result.startTime).toBe("12:00");

    /* A foreign combination is 1 TL, like TJK charges. */
    expect(result.unitPriceTl).toBe(1);

    expect(result.coupons.length).toBeGreaterThan(0);

    for (const coupon of result.coupons) {
      expect(coupon.totalTl).toBeLessThanOrEqual(750);
      expect(coupon.legs.map(leg => leg.raceNumber)).toEqual([3, 4, 5, 6, 7, 8]);
    }

    /* The ladder ends exactly on the budget the user picked. */
    expect(result.coupons[result.coupons.length - 1].targetBudgetTl).toBe(750);
  });

  it("refuses a window the card does not run", async () => {
    const env = await envWithMeeting();

    await expect(
      generateForeignSixFoldCoupons(env, {
        city: CITY, budgetTl: 500, sixfold: 3, raceDate: RACE_DATE
      })
    ).rejects.toThrow("SIX_FOLD_WINDOW_NOT_AVAILABLE");
  });

  it("refuses a meeting that is not on the card", async () => {
    const env = await envWithMeeting();

    await expect(
      generateForeignSixFoldCoupons(env, {
        city: "Nowhere", budgetTl: 500, sixfold: 1, raceDate: RACE_DATE
      })
    ).rejects.toThrow("FOREIGN_MEETING_NOT_FOUND");
  });

  it("refuses a window whose leg has no runner TJK priced", async () => {
    const stripped = races();
    stripped[1].runners = stripped[1].runners.map(runner => ({
      ...runner,
      agfPercent: null as unknown as number
    }));

    const env = await envWithMeeting(stripped);

    await expect(
      generateForeignSixFoldCoupons(env, {
        city: CITY, budgetTl: 500, sixfold: 1, raceDate: RACE_DATE
      })
    ).rejects.toThrow("SIX_FOLD_WINDOW_NOT_AVAILABLE");

    /* Race 2 is only in the first window, so the second still builds. */
    const second =
      await generateForeignSixFoldCoupons(env, {
        city: CITY, budgetTl: 500, sixfold: 2, raceDate: RACE_DATE
      });

    expect(second.startRace).toBe(3);
  });
});
