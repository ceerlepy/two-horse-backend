import { describe, expect, it } from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";
import {
  cleanupMyCoupons,
  deleteMyCoupon,
  listMyCoupons,
  MY_COUPONS_CONFIG,
  parseMyCouponInput,
  saveMyCoupon
} from "../src/coupons/my-coupons";

const NOW = new Date("2026-10-05T10:00:00Z");

async function testEnv(): Promise<any> {
  const env: any = { DB: createSqliteD1(["migrations/0047_my_coupons.sql", "migrations/0051_foreign_results.sql"]) };
  await env.DB.prepare(
    "CREATE TABLE learning_races (race_date TEXT, city TEXT, race_number INTEGER)"
  ).run();
  await env.DB.prepare(
    "CREATE TABLE learning_runner_features (race_date TEXT, city TEXT, race_number INTEGER, horse_number INTEGER, finish_position INTEGER)"
  ).run();
  return env;
}

async function addWinner(env: any, raceNumber: number, horseNumber: number) {
  await env.DB.prepare("INSERT INTO learning_races VALUES ('2026-10-05', 'Bursa', ?)").bind(raceNumber).run();
  await env.DB.prepare("INSERT INTO learning_runner_features VALUES ('2026-10-05', 'Bursa', ?, ?, 1)").bind(raceNumber, horseNumber).run();
}

const fivefold = (horses = [[1, 2], [3], [4, 5], [6], [7]]) => ({
  city: "Bursa",
  pool: "fivefold",
  windowNumber: 1,
  budgetTl: 500,
  totalTl: 480,
  combinations: 4,
  legs: horses.map((horseNumbers, i) => ({ raceNumber: 4 + i, horseNumbers }))
});

describe("Kuponlarım", () => {
  it("rejects anything that is not a coupon", () => {
    expect(parseMyCouponInput(null)).toBeNull();
    expect(parseMyCouponInput({ ...fivefold(), pool: "triple" })).toBeNull();
    expect(parseMyCouponInput({ ...fivefold(), legs: fivefold().legs.slice(0, 4) })).toBeNull();
    expect(parseMyCouponInput({ ...fivefold(), pool: "sixfold" })).toBeNull();
    expect(parseMyCouponInput(fivefold([[1], [2], [], [3], [4]]))).toBeNull();
    expect(parseMyCouponInput({ ...fivefold(), totalTl: -1 })).toBeNull();
    expect(parseMyCouponInput(fivefold([[2, 1, 2], [3], [4], [5], [6]]))?.legs[0].horseNumbers).toEqual([1, 2]);
  });

  it("saves once, lists only the member's own coupons, and grades them from results", async () => {
    const env = await testEnv();
    const input = parseMyCouponInput(fivefold())!;

    const first = await saveMyCoupon(env, "u1", input, NOW);
    const again = await saveMyCoupon(env, "u1", input, NOW);
    expect(first).toEqual({ ok: true, id: expect.any(Number) });
    expect(again).toEqual(first);
    await saveMyCoupon(env, "u2", input, NOW);

    let mine = await listMyCoupons(env, "u1", NOW);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ raceDate: "2026-10-05", city: "Bursa", pool: "fivefold", evaluated: false, hitLegs: null });

    // Four of five legs run: still waiting.
    await addWinner(env, 4, 2);
    await addWinner(env, 5, 9);
    await addWinner(env, 6, 5);
    await addWinner(env, 7, 6);
    mine = await listMyCoupons(env, "u1", NOW);
    expect(mine[0].evaluated).toBe(false);
    expect(mine[0].legs.map(l => l.winner)).toEqual([2, 9, 5, 6, null]);

    await addWinner(env, 8, 7);
    mine = await listMyCoupons(env, "u1", NOW);
    expect(mine[0]).toMatchObject({ evaluated: true, legCount: 5, hitLegs: 4, allLegsHit: false });
  });

  it("deletes only the member's own coupon", async () => {
    const env = await testEnv();
    const saved = await saveMyCoupon(env, "u1", parseMyCouponInput(fivefold())!, NOW);
    if (!saved.ok) throw new Error("not saved");
    expect(await deleteMyCoupon(env, "u2", saved.id)).toBe(false);
    expect(await deleteMyCoupon(env, "u1", saved.id)).toBe(true);
    expect(await listMyCoupons(env, "u1", NOW)).toEqual([]);
  });

  it("caps saves per day", async () => {
    const env = await testEnv();
    for (let i = 0; i < MY_COUPONS_CONFIG.maxSavesPerDay; i++) {
      const input = parseMyCouponInput(fivefold([[1], [2], [3], [4], [i + 1]].map(h => h.map(n => Math.min(n, 40)))))!;
      input.windowNumber = 1 + (i % 9);
      input.legs[0].horseNumbers = [1 + (i % 40)];
      input.legs[1].horseNumbers = [1 + Math.floor(i / 40)];
      expect((await saveMyCoupon(env, "u1", input, NOW)).ok).toBe(true);
    }
    expect(await saveMyCoupon(env, "u1", parseMyCouponInput(fivefold([[9], [9], [9], [9], [9]]))!, NOW))
      .toEqual({ ok: false, error: "MY_COUPONS_DAILY_LIMIT" });
  });

  it("drops rows past retention", async () => {
    const env = await testEnv();
    await saveMyCoupon(env, "u1", parseMyCouponInput(fivefold())!, new Date("2026-08-01T10:00:00Z"));
    await cleanupMyCoupons(env, NOW);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM my_coupons").first();
    expect(row.n).toBe(0);
  });

  it("grades a foreign coupon from TJK's foreign results, on the card's own date", async () => {
    const env = await testEnv();
    /* 00:30 on 6 Oct in Turkey: an American card dated 5 Oct is still running. */
    const lateNight = new Date("2026-10-05T21:30:00Z");
    const coupon = {
      ...fivefold(),
      city: "Keeneland ABD",
      raceDate: "2026-10-05"
    };

    const saved = await saveMyCoupon(env, "u1", parseMyCouponInput(coupon)!, lateNight);
    expect(saved.ok).toBe(true);

    for (const [raceNumber, horseNumber] of [[4, 2], [5, 3], [6, 9], [7, 6], [8, 7]]) {
      await env.DB.prepare(
        "INSERT INTO foreign_results VALUES ('2026-10-05', 'Keeneland ABD', ?, ?, 'X', 1, 'now')"
      ).bind(raceNumber, horseNumber).run();
    }

    const [entry] = await listMyCoupons(env, "u1", lateNight);
    expect(entry.raceDate).toBe("2026-10-05");
    expect(entry.evaluated).toBe(true);
    expect(entry.hitLegs).toBe(4);
    expect(entry.allLegsHit).toBe(false);

    /* A date that is neither today nor yesterday falls back to today. */
    const stale = await saveMyCoupon(env, "u1", parseMyCouponInput({ ...coupon, raceDate: "2026-09-01" })!, lateNight);
    const rows = await env.DB.prepare("SELECT race_date FROM my_coupons WHERE id = ?").bind((stale as any).id).all();
    expect(rows.results[0].race_date).toBe("2026-10-06");
  });
});
