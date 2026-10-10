import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSqliteD1 } from "./helpers/sqlite-d1";

const fetched: string[] = [];
vi.mock("../src/acquisition/http", () => ({
  acquireHttpHtml: async (url: string) => {
    fetched.push(url);
    if (url.endsWith("=666")) throw new Error("TJK down");
    return { html: "<table><tr><th>İ. Tarihi</th></tr></table>" };
  }
}));

import { backfillGallops, gallopBackfillState } from "../src/value-model/gallops";
import { buildTrainingDate, pendingTrainingDates, refreshTrainingRows } from "../src/value-model/training";
import {
  acceptRefit,
  loadRetrainRaces,
  mergeTrainingRows,
  retrainDue,
  retrainIfDue,
  loadState,
  type LabelledRow
} from "../src/value-model/evaluation";
import { VALUE_MODEL_FEATURES } from "../src/value-model/features";
import { addDays } from "../src/value-model/cities";
import { turkeyDate } from "../src/shared";

import { readdirSync } from "node:fs";

/* Every migration in order, so the schema matches production. */
const MIGRATIONS = readdirSync("migrations").filter(f => f.endsWith(".sql")).sort().map(f => `migrations/${f}`);

function freshEnv(): any {
  return { DB: createSqliteD1(MIGRATIONS) };
}

async function archiveRace(env: any, race: { code: number; date: string; market?: boolean; surface?: string; distance?: number },
  runners: Array<{ horse: number; no: number; pos: number; ganyan: number | null; agf: number | null; fig?: number | null; jockey?: number; start?: number }>) {
  await env.DB.prepare(`
    INSERT INTO result_archive_races(race_code, race_date, city_id, race_number, distance_meters, surface, market_ok, fetched_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(race.code, race.date, 3, race.code % 100, race.distance ?? 1400, race.surface ?? "Kum", race.market === false ? 0 : 1, "x").run();
  const total = runners.reduce((s, r) => s + (r.ganyan ? 1 / r.ganyan : 0), 0);
  for (const r of runners) {
    await env.DB.prepare(`
      INSERT INTO result_archive_runners(race_code, race_date, horse_id, horse_number, finish_position, ganyan, agf_percent,
        p_win, jockey_id, weight, fig, start_position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(race.code, race.date, r.horse, r.no, r.pos, r.ganyan, r.agf, r.ganyan ? 1 / r.ganyan / total : null,
      r.jockey ?? 10 + r.no, 57, r.fig ?? null, r.start ?? r.no).run();
  }
  await env.DB.prepare(`
    INSERT OR IGNORE INTO result_archive_dates(race_date, status, meetings, attempts, updated_at, revision)
    VALUES(?, 'done', 1, 1, 'x', 2)
  `).bind(race.date).run();
}

beforeEach(() => { fetched.length = 0; });

describe("gallop backfill for the archive refit", () => {
  it("walks never-fetched archive horses in id order and finishes", async () => {
    const env = freshEnv();
    const today = turkeyDate();
    await archiveRace(env, { code: 101, date: addDays(today, -10) }, [
      { horse: 5, no: 1, pos: 1, ganyan: 2, agf: 50 },
      { horse: 666, no: 2, pos: 2, ganyan: 3, agf: 30 },
      { horse: 9, no: 3, pos: 3, ganyan: 6, agf: 20 }
    ]);
    await env.DB.prepare(`INSERT INTO horse_gallop_state(horse_id, fetched_at, row_count) VALUES(9, 'x', 3)`).run();

    let state = await backfillGallops(env, 1, today);
    expect(fetched).toEqual([expect.stringContaining("AtId=5")]);
    expect(state).toMatchObject({ cursor: 5, done: false, fetched: 1 });

    /* a page that fails is passed over, not retried forever */
    state = await backfillGallops(env, 1, today);
    expect(state).toMatchObject({ cursor: 666, done: false, failed: 1 });

    state = await backfillGallops(env, 1, today);
    expect(state.done).toBe(true);
    expect(await gallopBackfillState(env)).toMatchObject({ done: true, fetched: 1, failed: 1 });

    fetched.length = 0;
    await backfillGallops(env, 5, today);
    expect(fetched).toEqual([]);
  });
});

describe("archive training rows", () => {
  it("computes features from strictly earlier races and stores the final market", async () => {
    const env = freshEnv();
    const day = "2026-09-20";
    await archiveRace(env, { code: 1, date: "2026-09-01" }, [
      { horse: 1, no: 1, pos: 1, ganyan: 2, agf: 50, fig: 90 },
      { horse: 2, no: 2, pos: 2, ganyan: 4, agf: 30, fig: 80 },
      { horse: 3, no: 3, pos: 3, ganyan: 8, agf: 20, fig: 70 }
    ]);
    await archiveRace(env, { code: 2, date: day }, [
      { horse: 1, no: 1, pos: 2, ganyan: 3, agf: 40, fig: 10 },
      { horse: 2, no: 2, pos: 1, ganyan: 2.5, agf: 45, fig: 120 },
      { horse: 3, no: 3, pos: 3, ganyan: 10, agf: 15, fig: 50 }
    ]);
    await archiveRace(env, { code: 3, date: day, market: false }, [
      { horse: 7, no: 1, pos: 1, ganyan: null, agf: null },
      { horse: 8, no: 2, pos: 2, ganyan: null, agf: null }
    ]);

    expect(await buildTrainingDate(env, day)).toBe(1);
    const rows = (await env.DB.prepare(`SELECT * FROM value_model_training_rows ORDER BY horse_id`).all()).results;
    expect(rows.map((r: any) => [r.horse_id, r.variant, r.won])).toEqual([[1, "full", 0], [2, "full", 1], [3, "full", 0]]);
    expect(rows.reduce((s: number, r: any) => s + r.p_agf, 0)).toBeCloseTo(1);
    expect(rows[1].p_agf).toBeCloseTo(0.45);
    expect(rows[0].p_ganyan).toBeCloseTo((1 / 3) / (1 / 3 + 1 / 2.5 + 1 / 10));

    /* fig_last_rel uses the 09-01 figures (90/80/70), never the race's own (10/120/50) */
    const fi = VALUE_MODEL_FEATURES.indexOf("fig_last_rel");
    expect(rows.map((r: any) => JSON.parse(r.features_json)[fi])).toEqual([10, 0, -10]);

    /* rebuilding a date replaces its rows */
    await buildTrainingDate(env, day);
    expect((await env.DB.prepare(`SELECT COUNT(*) AS n FROM value_model_training_rows`).first()).n).toBe(3);
    expect(await env.DB.prepare(`SELECT races, feature_version FROM value_model_training_dates WHERE race_date = ?`).bind(day).first())
      .toEqual({ races: 1, feature_version: 1 });
  });

  it("waits for the gallop backfill, then builds newest dates first", async () => {
    const env = freshEnv();
    const today = turkeyDate();
    for (const [code, back] of [[11, 4], [12, 3], [13, 2], [14, 1]] as const) {
      await archiveRace(env, { code, date: addDays(today, -back) }, [
        { horse: code * 10 + 1, no: 1, pos: 1, ganyan: 2, agf: 60 },
        { horse: code * 10 + 2, no: 2, pos: 2, ganyan: 3, agf: 40 }
      ]);
    }
    expect(await refreshTrainingRows(env, today)).toEqual({ dates: [], races: 0 });

    await env.DB.prepare(`INSERT INTO value_model_cache(cache_key, value_json, updated_at) VALUES('gallop-backfill', ?, 'x')`)
      .bind(JSON.stringify({ cursor: 0, done: true, fetched: 0, failed: 0 })).run();
    expect(await refreshTrainingRows(env, today)).toEqual({ dates: [addDays(today, -1), addDays(today, -2), addDays(today, -3)], races: 3 });
    expect(await pendingTrainingDates(env, 10, today)).toEqual([addDays(today, -4)]);
  });
});

describe("monthly refit on archive + live rows", () => {
  const row = (raceKey: string, raceCode: number | null): LabelledRow => ({
    raceKey, raceCode, raceDate: "2026-10-01", variant: "full", pModel: 0.5, pAgf: 0.5, pGanyan: 0.5, won: false, features: []
  });

  it("prefers the live prediction of a race over its archive row", () => {
    const merged = mergeTrainingRows([row("live|1", 100)], [row("archive|100", 100), row("archive|101", 101)]);
    expect(merged.map(r => r.raceKey)).toEqual(["archive|101", "live|1"]);
  });

  it("adopts only a proven holdout gain", () => {
    const base = { races: 1000, before: 1.9, after: 1.89 };
    expect(acceptRefit({ ...base, gain: 0.003, gainLow: 0.0005, gainHigh: 0.0055 })).toBe(true);
    expect(acceptRefit({ ...base, gain: 0.003, gainLow: -0.0005, gainHigh: 0.0065 })).toBe(false);
    expect(acceptRefit({ ...base, gain: 0.001, gainLow: 0.0002, gainHigh: 0.0018 })).toBe(false);
  });

  it("retries a skipped refit daily and a finished one monthly", () => {
    const state: any = { status: "active", retrained_at: "2026-10-01T00:00:00Z", retrain_json: JSON.stringify({ skipped: "x" }) };
    expect(retrainDue(state, Date.parse("2026-10-01T12:00:00Z"))).toBe(false);
    expect(retrainDue(state, Date.parse("2026-10-02T01:00:00Z"))).toBe(true);
    const done = { ...state, retrain_json: JSON.stringify({ races: 5000 }) };
    expect(retrainDue(done, Date.parse("2026-10-20T00:00:00Z"))).toBe(false);
    expect(retrainDue(done, Date.parse("2026-11-01T00:00:00Z"))).toBe(true);
    expect(retrainDue({ ...done, status: "warming" }, Date.parse("2027-01-01T00:00:00Z"))).toBe(false);
  });

  it("fits one variant per tick on archive rows and records the outcome", async () => {
    const env = freshEnv();
    const today = turkeyDate();
    let s = 11;
    const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const fi = VALUE_MODEL_FEATURES.indexOf("fig_best3_rel");
    for (let k = 0; k < 1600; k++) {
      const date = addDays(today, -1 - (k % 300));
      const market = [0.4, 0.25, 0.15, 0.1, 0.06, 0.04];
      const fig = market.map(() => rand() * 2 - 1);
      const u = market.map((p, i) => Math.log(p) + 1.5 * fig[i]);
      const z = u.reduce((a, x) => a + Math.exp(x), 0);
      let r = rand() * z, winner = 5;
      for (let i = 0; i < 6; i++) { r -= Math.exp(u[i]); if (r <= 0) { winner = i; break; } }
      const values = market.map((p, i) => {
        const f: Array<number | null> = VALUE_MODEL_FEATURES.map(() => null);
        f[fi] = fig[i];
        return [k + 1, i + 1, date, "full", p, p, i === winner ? 1 : 0, JSON.stringify(f)];
      });
      await env.DB.prepare(`
        INSERT INTO value_model_training_rows(race_code, horse_id, race_date, variant, p_agf, p_ganyan, won, features_json)
        VALUES ${values.map(() => "(?,?,?,?,?,?,?,?)").join(",")}
      `).bind(...values.flat()).run();
    }
    expect((await loadRetrainRaces(env)).length).toBe(1600);

    await retrainIfDue(env, await loadState(env), false);
    expect((await loadState(env)).retrained_at).toBeNull();

    await retrainIfDue(env, await loadState(env));
    await retrainIfDue(env, await loadState(env));
    const mid = await loadState(env);
    expect(mid.retrained_at).toBeNull();
    expect(JSON.parse((await env.DB.prepare(`SELECT value_json FROM value_model_cache WHERE cache_key='retrain-progress'`).first()).value_json).done)
      .toEqual(["full", "ganyan"]);

    await retrainIfDue(env, mid);
    const end = await loadState(env);
    const summary = JSON.parse(end.retrain_json!);
    expect(summary.races).toBe(1600);
    expect(summary.full.holdout.races).toBe(320);
    /* the synthetic figure is far stronger than the shipped coefficient: a clear, proven gain */
    expect(summary.full.adopted).toBe(true);
    expect(end.coefficients_version).toMatch(/^value-retrained-/);
    expect(JSON.parse(end.coefficients_json!).full.features.find((f: any) => f.name === "fig_best3_rel").coef).toBeGreaterThan(0.3);
    expect(await env.DB.prepare(`SELECT 1 FROM value_model_cache WHERE cache_key='retrain-progress'`).first()).toBeNull();

    /* not due again for a month */
    await retrainIfDue(env, end);
    expect((await loadState(env)).retrained_at).toBe(end.retrained_at);
  }, 120_000);
});
