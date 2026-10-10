import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

/*
 * "Kuponlarım": a member saves a coupon they built on the coupon
 * screen and later sees how many of its legs won. Only the member's
 * own saves are ever returned; the model's full coupon record is a
 * separate (currently hidden) screen, see ./history.ts.
 */
export const MY_COUPONS_CONFIG = {
  /* Saves per member per Turkey day; guards the table, not a product limit. */
  maxSavesPerDay: 50,
  listDays: 30,
  /* Rows are kept a little longer than they are listed. */
  retentionDays: 35,
  maxRows: 200
} as const;

export interface MyCouponLeg {
  raceNumber: number;
  horseNumbers: number[];
}

export interface MyCouponInput {
  city: string;
  pool: "sixfold" | "fivefold";
  windowNumber: number;
  budgetTl: number;
  totalTl: number;
  combinations: number;
  legs: MyCouponLeg[];
  /*
   * The card's date. Only sent for a foreign meeting: an American card
   * runs past midnight Turkey time but keeps its own date. Accepted when
   * it is today or yesterday, otherwise today is used.
   */
  raceDate?: string;
}

export interface MyCouponEntry {
  id: number;
  raceDate: string;
  city: string;
  pool: "sixfold" | "fivefold";
  windowNumber: number;
  budgetTl: number;
  totalTl: number;
  combinations: number;
  savedAt: string;
  evaluated: boolean;
  legCount: number;
  hitLegs: number | null;
  allLegsHit: boolean | null;
  legs: Array<MyCouponLeg & { winner: number | null }>;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/* Returns a clean copy of the request body, or null when it is not a coupon. */
export function parseMyCouponInput(body: any): MyCouponInput | null {
  const pool = body?.pool;
  if (pool !== "sixfold" && pool !== "fivefold") return null;

  const city = typeof body?.city === "string" ? body.city.trim() : "";
  if (!city || city.length > 60) return null;

  const windowNumber = Number(body?.windowNumber);
  const budgetTl = Number(body?.budgetTl);
  const totalTl = Number(body?.totalTl);
  const combinations = Number(body?.combinations);
  if (!isIntIn(windowNumber, 1, 9)) return null;
  if (!(budgetTl > 0 && budgetTl <= 1_000_000)) return null;
  if (!(totalTl > 0 && totalTl <= 1_000_000)) return null;
  if (!isIntIn(combinations, 1, 10_000_000)) return null;

  const legCount = pool === "sixfold" ? 6 : 5;
  if (!Array.isArray(body?.legs) || body.legs.length !== legCount) return null;

  const legs: MyCouponLeg[] = [];
  for (const leg of body.legs) {
    const raceNumber = Number(leg?.raceNumber);
    if (!isIntIn(raceNumber, 1, 20) || !Array.isArray(leg?.horseNumbers)) return null;
    const horseNumbers = [...new Set<number>(leg.horseNumbers.map(Number))].sort((a, b) => a - b);
    if (horseNumbers.length === 0 || horseNumbers.length > 30) return null;
    if (!horseNumbers.every(n => isIntIn(n, 1, 40))) return null;
    legs.push({ raceNumber, horseNumbers });
  }

  const raceDate =
    typeof body?.raceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.raceDate)
      ? body.raceDate
      : undefined;

  return { city, pool, windowNumber, budgetTl, totalTl, combinations, legs, ...(raceDate ? { raceDate } : {}) };
}

export async function saveMyCoupon(
  env: Env,
  userId: string,
  input: MyCouponInput,
  now = new Date()
): Promise<{ ok: true; id: number } | { ok: false; error: "MY_COUPONS_DAILY_LIMIT" }> {
  const today = turkeyDate(now);
  const raceDate =
    input.raceDate === today || input.raceDate === addDays(today, -1)
      ? input.raceDate
      : today;
  const selectionsJson = JSON.stringify(input.legs);

  const existing = await env.DB.prepare(
    `SELECT id FROM my_coupons
     WHERE user_id = ? AND race_date = ? AND city = ? AND pool = ? AND window_number = ? AND selections_json = ?`
  ).bind(userId, raceDate, input.city, input.pool, input.windowNumber, selectionsJson).first<{ id: number }>();
  if (existing) return { ok: true, id: Number(existing.id) };

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM my_coupons WHERE user_id = ? AND race_date = ?`
  ).bind(userId, today).first<{ n: number }>();
  if (Number(count?.n ?? 0) >= MY_COUPONS_CONFIG.maxSavesPerDay) {
    return { ok: false, error: "MY_COUPONS_DAILY_LIMIT" };
  }

  const inserted = await env.DB.prepare(
    `INSERT INTO my_coupons
       (user_id, race_date, city, pool, window_number, budget_tl, total_tl, combinations, selections_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, race_date, city, pool, window_number, selections_json) DO NOTHING
     RETURNING id`
  ).bind(
    userId, raceDate, input.city, input.pool, input.windowNumber,
    input.budgetTl, input.totalTl, input.combinations, selectionsJson, now.toISOString()
  ).first<{ id: number }>();

  if (inserted) return { ok: true, id: Number(inserted.id) };

  /* Saved by a parallel request between the check and the insert. */
  const again = await env.DB.prepare(
    `SELECT id FROM my_coupons
     WHERE user_id = ? AND race_date = ? AND city = ? AND pool = ? AND window_number = ? AND selections_json = ?`
  ).bind(userId, raceDate, input.city, input.pool, input.windowNumber, selectionsJson).first<{ id: number }>();
  return { ok: true, id: Number(again?.id ?? 0) };
}

export async function deleteMyCoupon(env: Env, userId: string, id: number): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM my_coupons WHERE id = ? AND user_id = ?`
  ).bind(id, userId).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

function parseLegs(value: unknown): MyCouponLeg[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((leg: any) => ({
      raceNumber: Number(leg?.raceNumber),
      horseNumbers: Array.isArray(leg?.horseNumbers) ? leg.horseNumbers.map(Number).filter(Number.isFinite) : []
    }));
  } catch {
    return [];
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/*
 * Winning horse per race for one meeting, from the same results the coupon
 * evaluation uses; a foreign (YD) meeting's come from foreign_results
 * (../foreign/results.ts). City names never overlap between the two.
 */
async function winnersFor(env: Env, raceDate: string, city: string): Promise<Map<number, number>> {
  /*
   * Live winners (../results/live-winners.ts) mark a leg minutes after its
   * race; the official result, when present, comes later in the order and
   * overrides them.
   */
  const rows = await env.DB.prepare(
    `SELECT race_number, horse_number, 0 AS priority
     FROM live_race_winners
     WHERE race_date = ? AND city = ?
     UNION ALL
     SELECT lr.race_number, lrf.horse_number, 1 AS priority
     FROM learning_races lr
     JOIN learning_runner_features lrf
       ON lrf.race_date = lr.race_date AND lrf.city = lr.city AND lrf.race_number = lr.race_number
     WHERE lr.race_date = ? AND lr.city = ? AND lrf.finish_position = 1
     UNION ALL
     SELECT race_number, horse_number, 1 AS priority
     FROM foreign_results
     WHERE race_date = ? AND city = ? AND finish_position = 1
     ORDER BY priority`
  ).bind(raceDate, city, raceDate, city, raceDate, city).all<any>();

  const winners = new Map<number, number>();
  for (const row of rows.results ?? []) {
    winners.set(Number(row.race_number), Number(row.horse_number));
  }
  return winners;
}

export async function listMyCoupons(env: Env, userId: string, now = new Date()): Promise<MyCouponEntry[]> {
  const fromDate = addDays(turkeyDate(now), -(MY_COUPONS_CONFIG.listDays - 1));

  const rows = await env.DB.prepare(
    `SELECT * FROM my_coupons
     WHERE user_id = ? AND race_date >= ?
     ORDER BY race_date DESC, created_at DESC
     LIMIT ?`
  ).bind(userId, fromDate, MY_COUPONS_CONFIG.maxRows).all<any>();

  const winnersByMeeting = new Map<string, Map<number, number>>();
  const entries: MyCouponEntry[] = [];

  for (const row of rows.results ?? []) {
    const meetingKey = `${row.race_date}|${row.city}`;
    let winners = winnersByMeeting.get(meetingKey);
    if (!winners) {
      winners = await winnersFor(env, row.race_date, row.city);
      winnersByMeeting.set(meetingKey, winners);
    }

    const legs = parseLegs(row.selections_json).map(leg => ({
      ...leg,
      winner: winners!.get(leg.raceNumber) ?? null
    }));
    const evaluated = legs.length > 0 && legs.every(leg => leg.winner != null);
    const hitLegs = legs.filter(leg => leg.winner != null && leg.horseNumbers.includes(leg.winner)).length;

    entries.push({
      id: Number(row.id),
      raceDate: row.race_date,
      city: row.city,
      pool: row.pool,
      windowNumber: Number(row.window_number),
      budgetTl: Number(row.budget_tl),
      totalTl: Number(row.total_tl),
      combinations: Number(row.combinations),
      savedAt: row.created_at,
      evaluated,
      legCount: legs.length,
      hitLegs: evaluated ? hitLegs : null,
      allLegsHit: evaluated ? hitLegs === legs.length : null,
      legs
    });
  }

  return entries;
}

export async function cleanupMyCoupons(env: Env, now = new Date()): Promise<void> {
  const cutoff = addDays(turkeyDate(now), -MY_COUPONS_CONFIG.retentionDays);
  await env.DB.prepare(`DELETE FROM my_coupons WHERE race_date < ?`).bind(cutoff).run();
}
