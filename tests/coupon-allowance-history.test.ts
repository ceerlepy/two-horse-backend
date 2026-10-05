import { describe, expect, it } from "vitest";

import { checkCouponAllowance, recordCouponRequest } from "../src/membership/coupon-allowance";
import { getCouponHistory } from "../src/coupons/history";
import { createSqliteD1 } from "./helpers/sqlite-d1";

function envWith(files: string[]): any {
  return { DB: createSqliteD1(files) };
}

const NOW = new Date("2026-10-05T10:00:00Z");

describe("coupon allowance", () => {
  const request = (budgetTl: number) => ({ city: "Bursa", pool: "sixfold", windowNumber: 1, budgetTl });

  it("caps gold at its daily allowance but lets a repeated request through", async () => {
    const env = envWith(["migrations/0045_coupon_allowance.sql"]);

    for (let i = 0; i < 10; i++) {
      const check = await checkCouponAllowance(env, "u1", "gold", request(100 + i), NOW);
      expect(check.allowed).toBe(true);
      await recordCouponRequest(env, "u1", "gold", request(100 + i), NOW);
    }

    const blocked = await checkCouponAllowance(env, "u1", "gold", request(999), NOW);
    expect(blocked).toEqual({ allowed: false, used: 10, limit: 10 });

    const repeat = await checkCouponAllowance(env, "u1", "gold", request(100), NOW);
    expect(repeat.allowed).toBe(true);

    const otherUser = await checkCouponAllowance(env, "u2", "gold", request(999), NOW);
    expect(otherUser.allowed).toBe(true);

    const nextDay = await checkCouponAllowance(env, "u1", "gold", request(999), new Date("2026-10-06T10:00:00Z"));
    expect(nextDay.allowed).toBe(true);
  });

  it("premium is never counted", async () => {
    const env = envWith(["migrations/0045_coupon_allowance.sql"]);
    for (let i = 0; i < 20; i++) await recordCouponRequest(env, "p1", "premium", request(i + 1), NOW);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM coupon_request_log").first();
    expect(row.n).toBe(0);
    expect((await checkCouponAllowance(env, "p1", "premium", request(5000), NOW)).allowed).toBe(true);
  });
});

describe("coupon history", () => {
  it("returns the earliest snapshot per window/profile with its result", async () => {
    const env = envWith([
      "tests/fixtures/coupon-history-base.sql",
      "migrations/0016_sixfold_coupon_tracking.sql",
      "migrations/0017_sixfold_snapshot_idempotency.sql",
      "migrations/0025_sixfold_coupon_unresolved_reason.sql",
      "migrations/0028_fivefold_ganyan.sql"
    ]);
    const legs = JSON.stringify([{ raceNumber: 3, horseNumbers: [1, 4], coverageProbability: 0.5 }]);
    const insert = (generatedAt: string, hit: number | null, date = "2026-10-04") =>
      env.DB.prepare(
        `INSERT INTO sixfold_coupon_snapshots (race_date, city, sixfold_number, profile, start_race, end_race,
          budget_tl, total_tl, combinations, unit_price_tl, multiplier, selections_json, generated_at,
          evaluated_at, hit_legs, six_of_six)
         VALUES (?, 'Bursa', 1, '500', 3, 8, 500, 480, 960, 0.5, 1, ?, ?, ?, ?, ?)`
      ).bind(date, legs, generatedAt, hit == null ? null : "2026-10-04T18:00:00Z", hit, hit === 6 ? 1 : 0).run();

    await insert("2026-10-04T11:00:00Z", 5);
    await insert("2026-10-04T13:00:00Z", 6);
    await insert("2026-08-01T11:00:00Z", 6, "2026-08-01");

    const history = await getCouponHistory(env, { days: 30, now: NOW });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      pool: "sixfold",
      city: "Bursa",
      generatedAt: "2026-10-04T11:00:00Z",
      evaluated: true,
      hitLegs: 5,
      allLegsHit: false,
      legCount: 6,
      legs: [{ raceNumber: 3, horseNumbers: [1, 4] }]
    });
  });
});
