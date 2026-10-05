import { describe, expect, it, vi } from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";
import { cityScopedTarget } from "../src/experts/adapters/target-scope";
import { extractExperts } from "../src/experts/extractor";
import {
  attachNextDayExperts,
  browserlessEnv,
  canonicalCardFromProgram,
  hasNextDayDateEvidence,
  matchNextDayPicks,
  refreshNextDayExpertsIfDue
} from "../src/experts/next-day-service";
import type { NextDayProgram } from "../src/tjk/next-day-service";
import type { ExpertPickInput } from "../src/types/models";

/* 2026-10-05 19:00 Turkey time (UTC+3); D+1 = 2026-10-06. */
const EVENING = new Date("2026-10-05T16:00:00Z");
const LATER = new Date("2026-10-05T18:30:00Z");
const TEN_MIN_LATER = new Date("2026-10-05T16:10:00Z");
/* 2026-10-05 15:00 Turkey time. */
const AFTERNOON = new Date("2026-10-05T12:00:00Z");

const CARD: NextDayProgram = {
  date: "2026-10-06",
  meetings: [{
    city: "Bursa",
    races: [
      {
        race_number: 1, start_time: "14:30", starts_at: null, distance_meters: 1400, track: "Kum",
        sixfold_start_numbers: [1],
        runners: [
          { horse_number: 3, horse_name: "RÜZGAR", jockey: null, weight: null, hp: null, recent_form_raw: null, start_position: null },
          { horse_number: 5, horse_name: "YILDIZ", jockey: null, weight: null, hp: null, recent_form_raw: null, start_position: null }
        ]
      },
      {
        race_number: 2, start_time: "15:00", starts_at: null, distance_meters: 1200, track: "Kum",
        runners: [
          { horse_number: 1, horse_name: "KARA", jockey: null, weight: null, hp: null, recent_form_raw: null, start_position: null },
          { horse_number: 2, horse_name: "BEYAZ", jockey: null, weight: null, hp: null, recent_form_raw: null, start_position: null }
        ]
      }
    ]
  }]
};

function pick(raceNumber: number, horseNumber: number, horseName: string | null, flags: Partial<ExpertPickInput> = {}): ExpertPickInput {
  return {
    city: "Bursa", raceNumber, horseNumber, horseName, comment: "secret source text",
    isFavorite: false, isBanko: false, isStrong: false, isStar: false,
    isRival: false, isSurprise: false, isAvoid: false,
    sourceRank: null, confidence: 0.8, ...flags
  };
}

const SOURCES = [
  { source_key: "puanli_altili_bulten", source_name: "Puanlı Altılı Bülten", source_type: "expert", base_weight: 1 },
  { source_key: "horseturk", source_name: "HorseTurk", source_type: "expert", base_weight: 1 },
  { source_key: "istinye_ganyan", source_name: "İstinye Ganyan", source_type: "expert", base_weight: 1 },
  { source_key: "afa", source_name: "AFA", source_type: "expert", base_weight: 1 }
];

async function testEnv(withCard = true): Promise<any> {
  const env: any = {
    DB: createSqliteD1([
      "migrations/0048_next_day_program.sql",
      "migrations/0049_next_day_expert_picks.sql"
    ]),
    AI: { run: vi.fn() },
    BROWSER: { fetch: vi.fn() }
  };
  await env.DB.prepare(`CREATE TABLE refresh_state (
    pipeline_key TEXT PRIMARY KEY, last_success_at TEXT, last_attempt_at TEXT,
    next_allowed_at TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
    lease_until TEXT, last_error TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE TABLE source_registry (
    source_key TEXT PRIMARY KEY, source_name TEXT, source_type TEXT, base_weight REAL,
    content_hash TEXT, last_checked_at TEXT, last_success_at TEXT, consecutive_failures INTEGER DEFAULT 0)`).run();
  await env.DB.prepare(`CREATE TABLE expert_predictions (race_date TEXT, source_key TEXT, city TEXT)`).run();
  await env.DB.prepare(`CREATE TABLE meetings (race_date TEXT, city TEXT)`).run();
  await env.DB.prepare("INSERT INTO meetings VALUES ('2026-10-05', 'Adana')").run();
  for (const s of SOURCES) {
    await env.DB.prepare(
      "INSERT INTO source_registry(source_key, source_name, source_type, base_weight, content_hash, last_checked_at) VALUES (?, ?, ?, ?, 'h0', 't0')"
    ).bind(s.source_key, s.source_name, s.source_type, s.base_weight).run();
  }
  if (withCard) {
    await env.DB.prepare("INSERT INTO next_day_programs VALUES ('2026-10-06', ?, 'x')").bind(JSON.stringify(CARD)).run();
  }
  return env;
}

function fakeDocument(html: string, text = html) {
  return {
    stage: "http",
    acquired: { html, bodyLength: html.length },
    normalized: { text, selectedRoot: "body", originalCharacters: text.length, outputCharacters: text.length, truncated: false },
    semanticText: text,
    compacted: false,
    failures: []
  } as any;
}

function deps(overrides: Record<string, any> = {}) {
  const extract = vi.fn(async (_env: any, _url: string, _name: string, key: string) => ({
    extraction: {
      picks: key === "horseturk"
        ? [pick(1, 3, "RÜZGAR", { isBanko: true }), pick(2, 9, "YOK BOYLE AT", { isFavorite: true })]
        : [pick(1, 3, "RÜZGAR", { isFavorite: true }), pick(1, 5, "YILDIZ", { isRival: true })]
    },
    status: "success" as const,
    method: key === "puanli_altili_bulten" ? "http-deterministic-score-table" : "http-workers-ai-json",
    diagnostics: {}
  }));
  return {
    sources: vi.fn(async () => SOURCES.filter(s => s.source_key !== "istinye_ganyan") as any),
    resolve: vi.fn(async (_env: any, source: any) => ({
      status: "ready" as const, mode: "article" as const,
      targets: [cityScopedTarget(`https://example.test/${source.source_key}/bursa-6-ekim`, "Bursa")],
      discoveredFromUrl: null, discoveryMethod: null, diagnostics: {}
    })),
    acquire: vi.fn(async (_env: any, url: string) => fakeDocument(`<html><body>${url} Bursa 6 Ekim 2026</body></html>`)),
    extract,
    ...overrides
  };
}

describe("matchNextDayPicks", () => {
  it("keeps only picks that resolve to a real D+1 runner", () => {
    const card = canonicalCardFromProgram(CARD);
    expect(card.cities).toEqual(["Bursa"]);
    expect(card.sixfoldStarts).toEqual([{ city: "Bursa", sixfoldNumber: 1, raceNumber: 1 }]);

    const matched = matchNextDayPicks(card.runners, [
      pick(1, 3, "RÜZGAR", { isFavorite: true }),
      pick(1, 3, "RÜZGAR", { isBanko: true }),
      pick(2, 2, "BEYAZ", { isRival: true }),
      pick(2, 9, "YOK BOYLE AT", { isFavorite: true })
    ]);

    expect(matched.map(p => `${p.raceNumber}-${p.horseNumber}`).sort()).toEqual(["1-3", "2-2"]);
    expect(matched.find(p => p.horseNumber === 3)).toMatchObject({ isFavorite: true, isBanko: true });
  });
});

describe("refreshNextDayExpertsIfDue", () => {
  it("does nothing outside 18:00-24:00 or without a stored D+1 card", async () => {
    const d = deps();
    expect((await refreshNextDayExpertsIfDue(await testEnv(), { now: AFTERNOON, ...d })).reason).toBe("outside-window");
    expect((await refreshNextDayExpertsIfDue(await testEnv(false), { now: EVENING, ...d })).reason).toBe("no-next-day-program");
    expect(d.resolve).not.toHaveBeenCalled();
    expect(d.extract).not.toHaveBeenCalled();
  });

  it("stores matched picks for the allowlist only, skips AI on an unchanged hash, honours cadence", async () => {
    const env = await testEnv();
    const registryBefore = await env.DB.prepare("SELECT * FROM source_registry ORDER BY source_key").all();
    const d = deps();

    const first = await refreshNextDayExpertsIfDue(env, { now: EVENING, ...d });
    expect(first.results?.map(r => [r.source, r.status, r.picks, r.aiCalls])).toEqual([
      ["puanli_altili_bulten", "stored", 2, 0],
      ["horseturk", "stored", 1, 1]
    ]);
    /* AFA is not allowlisted (Browser Rendering only). */
    expect(d.resolve.mock.calls.map((c: any[]) => c[1].source_key)).not.toContain("afa");
    /* Adapters run with a Browser Rendering binding that refuses every use. */
    expect(() => (d.resolve.mock.calls[0][0] as any).BROWSER.fetch).toThrow(/BROWSER_DISABLED/);

    const rows = await env.DB.prepare(
      "SELECT city, race_number, horse_number, source_key FROM next_day_expert_picks ORDER BY source_key, race_number, horse_number"
    ).all();
    expect(rows.results).toEqual([
      { city: "Bursa", race_number: 1, horse_number: 3, source_key: "horseturk" },
      { city: "Bursa", race_number: 1, horse_number: 3, source_key: "puanli_altili_bulten" },
      { city: "Bursa", race_number: 1, horse_number: 5, source_key: "puanli_altili_bulten" }
    ]);

    /* Inside the cadence window nothing is fetched again. */
    const soon = await refreshNextDayExpertsIfDue(env, { now: TEN_MIN_LATER, ...d });
    expect(soon.results?.every(r => r.status === "cadence")).toBe(true);

    /* Same content later: hash unchanged, no extraction (no Workers AI). */
    d.extract.mockClear();
    const later = await refreshNextDayExpertsIfDue(env, { now: LATER, ...d });
    expect(later.results?.map(r => r.status)).toEqual(["unchanged", "unchanged"]);
    expect(d.extract).not.toHaveBeenCalled();

    /* Today's expert tables and source_registry are never touched. */
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM expert_predictions").first()).n).toBe(0);
    expect(await env.DB.prepare("SELECT * FROM source_registry ORDER BY source_key").all()).toEqual(registryBefore);
  });

  it("re-extracts when the source's D+1 content changes", async () => {
    const env = await testEnv();
    let version = 1;
    const d = deps({
      acquire: vi.fn(async (_env: any, url: string) =>
        fakeDocument(`<html><body>${url} v${version}</body></html>`))
    });
    await refreshNextDayExpertsIfDue(env, { now: EVENING, ...d });
    version = 2;
    d.extract.mockClear();
    const later = await refreshNextDayExpertsIfDue(env, { now: LATER, ...d });
    expect(later.results?.map(r => r.status)).toEqual(["stored", "stored"]);
    expect(d.extract).toHaveBeenCalledTimes(2);
  });

  it("skips istinye_ganyan when its reused page has no D+1 date evidence", async () => {
    const env = await testEnv();
    const todayPage = `<html><body><h1>5 EKİM PAZARTESİ ADANA ALTILI GANYAN TAHMİNLERİ</h1>${"Koşu yorum ".repeat(40)}</body></html>`;
    const d = deps({
      sources: vi.fn(async () => SOURCES.filter(s => s.source_key === "istinye_ganyan") as any),
      resolve: vi.fn(async () => ({
        status: "ready", mode: "direct-current-page",
        targets: ["https://istinyeganyan.com/ganyan/tahminler/"],
        discoveredFromUrl: null, discoveryMethod: null, diagnostics: {}
      })),
      acquire: vi.fn(async () => fakeDocument(todayPage))
    });

    const result = await refreshNextDayExpertsIfDue(env, { now: EVENING, ...d });
    expect(result.results).toMatchObject([{ source: "istinye_ganyan", status: "no-date-evidence" }]);
    expect(d.extract).not.toHaveBeenCalled();
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM next_day_expert_picks").first()).n).toBe(0);
  });

  it("prunes past D+1 rows", async () => {
    const env = await testEnv();
    await env.DB.prepare(
      "INSERT INTO next_day_expert_picks(race_date, city, race_number, horse_number, source_key, fetched_at) VALUES ('2026-10-04', 'Bursa', 1, 1, 'horseturk', 'x')"
    ).run();
    await refreshNextDayExpertsIfDue(env, { now: AFTERNOON, ...deps() });
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM next_day_expert_picks").first()).n).toBe(0);
  });
});

describe("hasNextDayDateEvidence", () => {
  const filler = "Koşu yorum ".repeat(40);
  it("requires a D+1 city/date heading and no remaining heading for today", () => {
    const tomorrow = `<body><h1>6 EKİM SALI BURSA ALTILI GANYAN TAHMİNLERİ</h1>${filler}</body>`;
    const both = `<body><h1>5 EKİM PAZARTESİ ADANA ALTILI GANYAN TAHMİNLERİ</h1>${filler}<h1>6 EKİM SALI BURSA ALTILI GANYAN TAHMİNLERİ</h1></body>`;
    const today = `<body><h1>5 EKİM PAZARTESİ ADANA ALTILI GANYAN TAHMİNLERİ</h1>${filler}</body>`;

    expect(hasNextDayDateEvidence("istinye_ganyan", tomorrow, "2026-10-06", ["Bursa"], "2026-10-05", ["Adana"])).toBe(true);
    expect(hasNextDayDateEvidence("istinye_ganyan", both, "2026-10-06", ["Bursa"], "2026-10-05", ["Adana"])).toBe(false);
    expect(hasNextDayDateEvidence("istinye_ganyan", today, "2026-10-06", ["Bursa"], "2026-10-05", ["Adana"])).toBe(false);
  });
});

describe("extractExperts with a supplied canonical card", () => {
  it("reads picks without touching D1's meetings/races/runners", async () => {
    const html = `<table>
      <tr class='bas'><td><span class='no'>1. KOŞU</span></td></tr>
      <tr><td class='puan'>90</td><td class='at'>3 RÜZGAR KG</td></tr>
      <tr><td class='puan'>80</td><td class='at'>5 YILDIZ</td></tr>
    </table>`;
    const prepare = vi.fn(() => { throw new Error("D1 must not be read"); });
    const env: any = { DB: { prepare }, AI: { run: vi.fn() } };
    const card = canonicalCardFromProgram(CARD);

    const result = await extractExperts(
      env, cityScopedTarget("https://puanlialtilibulten.blogspot.com/2026/10/bursa.html", "Bursa"),
      "Puanlı Altılı Bülten", "puanli_altili_bulten", "2026-10-06",
      { ...card, document: fakeDocument(html) }
    );

    expect(prepare).not.toHaveBeenCalled();
    expect(env.AI.run).not.toHaveBeenCalled();
    expect(matchNextDayPicks(card.runners, result.extraction.picks).map(p => p.horseNumber)).toEqual([3, 5]);
  });
});

describe("attachNextDayExperts", () => {
  async function seeded() {
    const env = await testEnv();
    for (const [key, flags] of [["horseturk", "1,0"], ["puanli_altili_bulten", "1,0"], ["afa", "0,1"]] as const) {
      const [fav, avoid] = flags.split(",");
      await env.DB.prepare(
        `INSERT INTO next_day_expert_picks(race_date, city, race_number, horse_number, source_key, is_favorite, is_avoid, fetched_at)
         VALUES ('2026-10-06', 'Bursa', 1, 3, ?, ?, ?, 'x')`
      ).bind(key, Number(fav), Number(avoid)).run();
    }
    return env;
  }

  it("adds a count of distinct positive sources and a counts-only sentence for paid tiers", async () => {
    const out = await attachNextDayExperts(await seeded(), CARD, "gold");
    const runner: any = out.meetings[0].races[0].runners[0];
    expect(runner.expertPickCount).toBe(2);
    expect(runner.expertSummary).toMatch(/^3 kaynaktan/);
    expect(out.meetings[0].races[0].runners[1]).not.toHaveProperty("expertPickCount");

    const json = JSON.stringify(out);
    for (const leak of ["horseturk", "puanli", "afa", "HorseTurk", "secret"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("strips both fields for the free tier", async () => {
    const out = await attachNextDayExperts(await seeded(), CARD, "free");
    const json = JSON.stringify(out);
    expect(json).not.toContain("expertPickCount");
    expect(json).not.toContain("expertSummary");
  });
});

describe("browserlessEnv", () => {
  it("keeps every other binding and blocks Browser Rendering", () => {
    const env: any = { DB: {}, AI: {}, BROWSER: { fetch: () => "ok" } };
    const guarded: any = browserlessEnv(env);
    expect(guarded.DB).toBe(env.DB);
    expect(guarded.AI).toBe(env.AI);
    expect(() => guarded.BROWSER.fetch).toThrow(/BROWSER_DISABLED/);
  });
});
