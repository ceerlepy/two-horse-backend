import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";

const meetings = [
  {
    city: "Bursa",
    races: [
      {
        race_number: 3,
        distance_meters: 1400,
        track: "Kum",
        start_time: "15:30",
        runners: [
          {
            horse_number: 1,
            horse_name: "KARAYEL",
            jockey: "A. ÇELİK",
            agf_percent: 12.5,
            hp: 70,
            weight: 58,
            recent_form_raw: "",
            modelScore: { score: 40 },
            expertConsensus: { sourceCount: 0 }
          },
          {
            horse_number: 4,
            horse_name: "RÜZGAR",
            jockey: "H. KARATAŞ",
            agf_percent: 31.2,
            hp: 85,
            weight: 57,
            recent_form_raw: "1213",
            modelScore: { score: 72 },
            marketMovement: { direction: "up", firstAgf: 25, latestAgf: 31.2 },
            expertConsensus: { sourceCount: 6, bankoCount: 2, favoriteCount: 3, avoidCount: 0 }
          }
        ]
      }
    ]
  }
];

vi.mock("../src/storage/program-repository", () => ({
  getToday: vi.fn(async () => structuredClone(meetings))
}));

vi.mock("../src/value-model/service", () => ({
  loadTodayValues: vi.fn(async () => ({ status: "active", byRunner: new Map() })),
  attachValues: (m: any[]) => m
}));

const { askAi, raceContext, ASK_AI_CONFIG, cleanupAskAiLog } = await import("../src/ask/service");

const NOW = new Date("2026-10-05T10:00:00Z");

function envWith(answer = "RÜZGAR öne çıkıyor.", gemmaFails = false) {
  const run = vi.fn(async (model: string) => {
    if (model === ASK_AI_CONFIG.fallbackModel) return { response: answer };
    if (gemmaFails) throw new Error("3040: capacity");
    return { choices: [{ message: { role: "assistant", content: answer } }] };
  });
  const env: any = {
    AI: { run },
    DB: createSqliteD1([
      "migrations/0031_ai_response_cache.sql",
      "migrations/0046_ask_ai.sql"
    ])
  };
  return { env, run };
}

const ask = (question: string, extra: Partial<{ city: string; raceNumber: number; language: "tr" | "en" }> = {}) => ({
  city: "Bursa",
  raceNumber: 3,
  question,
  language: "tr" as const,
  ...extra
});

describe("AI'ya sor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("builds the race table from our own numbers, ranked by our score", () => {
    const context = raceContext({ ...meetings[0].races[0], city: "Bursa" });
    const lines = context.split("\n");
    expect(lines[0]).toMatch(/^Columns:/);
    expect(lines[1]).toContain("Bursa race 3, 1400m Kum");
    expect(lines[2]).toMatch(/^1\. #4 RÜZGAR/);
    expect(lines[2]).toContain("AGF up 25.0→31.2");
    expect(lines[2]).toContain("experts 6 (banko 2, fav 3");
    expect(lines[3]).toContain("form debut");
    expect(lines[3]).toContain("experts 0");
  });

  it("is Premium only", async () => {
    const { env, run } = envWith();
    expect(await askAi(env, "u1", "gold", ask("Kim kazanır?"), NOW)).toEqual({ ok: false, error: "TIER_UPGRADE_REQUIRED" });
    expect(await askAi(env, "u1", "free", ask("Kim kazanır?"), NOW)).toEqual({ ok: false, error: "TIER_UPGRADE_REQUIRED" });
    expect(run).not.toHaveBeenCalled();
  });

  it("answers, counts distinct questions, and repeats are free and cached", async () => {
    const { env, run } = envWith();

    const first = await askAi(env, "u1", "premium", ask("Kim kazanır?"), NOW);
    expect(first).toEqual({ ok: true, answer: "RÜZGAR öne çıkıyor.", cached: false, used: 1, limit: 20 });

    expect((run.mock.calls[0] as any)[0]).toBe(ASK_AI_CONFIG.model);
    expect((run.mock.calls[0] as any)[1]).toMatchObject({
      max_completion_tokens: ASK_AI_CONFIG.maxAnswerTokens,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false }
    });
    const prompt = (run.mock.calls[0] as any)[1].messages;
    expect(prompt[0].content).toContain("Answer in Turkish");
    expect(prompt[1].content).toContain("Question: kim kazanır?");

    const again = await askAi(env, "u1", "premium", ask("  kim   KAZANIR? "), NOW);
    expect(again).toMatchObject({ ok: true, cached: true, used: 1 });
    expect(run).toHaveBeenCalledTimes(1);

    // Another member asking the same thing gets the cached answer: no new bill.
    const other = await askAi(env, "u2", "premium", ask("Kim kazanır?"), NOW);
    expect(other).toMatchObject({ ok: true, cached: true, used: 1 });
    expect(run).toHaveBeenCalledTimes(1);

    const billed = await env.DB.prepare("SELECT SUM(billed) AS n FROM ask_ai_log").first();
    expect(billed.n).toBe(1);
  });

  it("stops at the daily allowance but still serves a repeated question", async () => {
    const { env } = envWith();
    for (let i = 0; i < 20; i++) {
      expect((await askAi(env, "u1", "premium", ask(`Soru ${i}`), NOW)).ok).toBe(true);
    }
    expect(await askAi(env, "u1", "premium", ask("Soru 99"), NOW)).toEqual({ ok: false, error: "DAILY_LIMIT_REACHED", used: 20, limit: 20 });
    expect((await askAi(env, "u1", "premium", ask("Soru 3"), NOW)).ok).toBe(true);
    expect((await askAi(env, "u1", "premium", ask("Soru 99"), new Date("2026-10-06T10:00:00Z"))).ok).toBe(true);
  });

  it("never makes a billed call past the global daily cap", async () => {
    const { env, run } = envWith();
    await env.DB.prepare(
      "INSERT INTO ask_ai_log (user_id, usage_date, question_key, billed, created_at) VALUES ('x', '2026-10-05', 'k', ?, '')"
    ).bind(ASK_AI_CONFIG.globalDailyAiCalls).run();

    expect(await askAi(env, "u1", "premium", ask("Kim kazanır?"), NOW)).toMatchObject({ ok: false, error: "ASK_BUSY" });
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects bad input and unknown races without calling the model", async () => {
    const { env, run } = envWith();
    expect(await askAi(env, "u1", "premium", ask("a"), NOW)).toEqual({ ok: false, error: "INVALID_QUESTION" });
    expect(await askAi(env, "u1", "premium", ask("x".repeat(301)), NOW)).toEqual({ ok: false, error: "INVALID_QUESTION" });
    expect(await askAi(env, "u1", "premium", ask("Kim kazanır?", { raceNumber: 9 }), NOW)).toEqual({ ok: false, error: "RACE_NOT_FOUND" });
    expect(run).not.toHaveBeenCalled();
  });

  it("answers in English when the app is in English", async () => {
    const { env, run } = envWith("RÜZGAR leads.");
    await askAi(env, "u1", "premium", ask("Who wins?", { language: "en", city: "bursa" }), NOW);
    expect((run.mock.calls[0] as any)[1].messages[0].content).toContain("Answer in English");
  });

  it("falls back to Llama when Gemma fails, and bills that call", async () => {
    const { env, run } = envWith("RÜZGAR öne çıkıyor.", true);
    expect(await askAi(env, "u1", "premium", ask("Kim kazanır?"), NOW)).toMatchObject({ ok: true, answer: "RÜZGAR öne çıkıyor.", cached: false });
    expect(run.mock.calls.map((c: any) => c[0])).toEqual([ASK_AI_CONFIG.model, ASK_AI_CONFIG.fallbackModel]);
    const billed = await env.DB.prepare("SELECT SUM(billed) AS n FROM ask_ai_log").first();
    expect(billed.n).toBe(1);
  });

  it("does not count a failed answer", async () => {
    const { env } = envWith("   ");
    expect(await askAi(env, "u1", "premium", ask("Kim kazanır?"), NOW)).toMatchObject({ ok: false, error: "ASK_FAILED" });
    const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM ask_ai_log WHERE user_id = 'u1'").first();
    expect(mine.n).toBe(0);
    // Both billed calls still count toward the global safety net.
    const billed = await env.DB.prepare("SELECT SUM(billed) AS n FROM ask_ai_log").first();
    expect(billed.n).toBe(2);
  });

  it("cleans up rows older than 30 days", async () => {
    const { env } = envWith();
    await env.DB.prepare(
      "INSERT INTO ask_ai_log (user_id, usage_date, question_key, billed, created_at) VALUES ('x', '2020-01-01', 'k', 1, '')"
    ).run();
    await cleanupAskAiLog(env);
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ask_ai_log").first();
    expect(row.n).toBe(0);
  });
});

describe("AI'ya sor on a foreign card", () => {
  beforeEach(() => vi.clearAllMocks());

  const FOREIGN_CITY = "Keeneland ABD";

  const foreignRaces = [
    {
      raceNumber: 2,
      time: "20:35",
      distanceMeters: 1700,
      track: "Kum",
      runners: [
        {
          number: 1, name: "FIRST LADY", jockey: "J. ROSARIO",
          weight: 57, agfPercent: 42, recentForm: "321"
        },
        {
          number: 5, name: "LATE CALL", jockey: "I. ORTIZ",
          weight: 56, agfPercent: 58, recentForm: "111"
        },
        {
          number: 7, name: "NO PRICE", jockey: null,
          weight: null, agfPercent: null, recentForm: null
        }
      ]
    }
  ];

  async function envWithForeign() {
    const { env, run } = envWith("LATE CALL öne çıkıyor.");

    await env.DB.prepare(
      "CREATE TABLE foreign_meetings (race_date TEXT, city TEXT, country TEXT, yd_order INTEGER, program_json TEXT, source_url TEXT, fetched_at TEXT, PRIMARY KEY (race_date, city))"
    ).run();

    await env.DB.prepare("INSERT INTO foreign_meetings VALUES (?,?,?,?,?,?,?)")
      .bind(
        "2026-10-05", FOREIGN_CITY, "ABD", 4,
        JSON.stringify(foreignRaces), "https://x", "2026-10-05T10:00:00Z"
      )
      .run();

    await env.DB.prepare(
      "CREATE TABLE foreign_results (race_date TEXT, city TEXT, race_number INTEGER, horse_number INTEGER, horse_name TEXT, finish_position INTEGER, fetched_at TEXT)"
    ).run();

    return { env, run };
  }

  const foreignAsk = (question: string) => ({
    city: FOREIGN_CITY,
    raceNumber: 2,
    question,
    language: "tr" as const,
    foreign: true
  });

  it("answers from the foreign card's own numbers", async () => {
    const { env, run } = await envWithForeign();

    const result = await askAi(env, "u1", "premium", foreignAsk("Favori kim?"), NOW);
    expect(result).toMatchObject({ ok: true, answer: "LATE CALL öne çıkıyor." });

    const prompt = (run.mock.calls[0] as any)[1].messages[1].content;
    const lines = prompt.split("\n");

    /* Ranked by our corrected chance, not by the card order. */
    expect(lines[3]).toMatch(/^1\. #5 LATE CALL/);
    expect(lines[3]).toContain("our win chance");
    expect(lines[2]).toContain("Keeneland ABD (ABD) race 2, 1700m Kum");

    /* The model is told which columns a foreign card does not have. */
    expect(prompt).toContain("no expert picks");
    expect(prompt).not.toContain("HP ");

    /* A horse TJK priced nothing for is shown as such, not dropped. */
    expect(prompt).toContain("#7 NO PRICE");
  });

  it("does not share an answer with a domestic race of the same name", async () => {
    const { env, run } = await envWithForeign();

    await askAi(env, "u1", "premium", ask("Favori kim?", { city: "Bursa", raceNumber: 3 }), NOW);
    await askAi(env, "u1", "premium", foreignAsk("Favori kim?"), NOW);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("says the race is not there when the card has no such race", async () => {
    const { env } = await envWithForeign();

    expect(
      await askAi(env, "u1", "premium", { ...foreignAsk("Favori kim?"), raceNumber: 9 }, NOW)
    ).toEqual({ ok: false, error: "RACE_NOT_FOUND" });
  });

  it("answers about the whole meeting from the screen's own button", async () => {
    const { env, run } = await envWithForeign();

    await env.DB.prepare(
      "INSERT INTO foreign_results VALUES ('2026-10-05', ?, 2, 5, 'LATE CALL', 1, 'now')"
    ).bind(FOREIGN_CITY).run();

    const result =
      await askAi(env, "u1", "premium", { ...foreignAsk("Bugün en sağlam koşu hangisi?"), raceNumber: 0 }, NOW);
    expect(result).toMatchObject({ ok: true });

    const prompt = (run.mock.calls[0] as any)[1].messages[1].content;
    expect(prompt).toContain("Keeneland ABD (ABD), the whole card");
    expect(prompt).toMatch(/Race 2 \(20:35, 1700m Kum, 3 runners\): #5 LATE CALL/);
    expect(prompt).toContain("official result: 1. #5 LATE CALL");

    /* A domestic race has no whole-meeting question. */
    expect(
      await askAi(env, "u1", "premium", ask("Favori kim?", { city: "Bursa", raceNumber: 0 }), NOW)
    ).toEqual({ ok: false, error: "INVALID_QUESTION" });
  });

  it("finds an American card after midnight under its own date", async () => {
    const { env } = await envWithForeign();
    const afterMidnight = new Date("2026-10-05T22:30:00Z");

    expect(
      await askAi(env, "u1", "premium", { ...foreignAsk("Favori kim?"), raceDate: "2026-10-05" }, afterMidnight)
    ).toMatchObject({ ok: true });

    expect(
      await askAi(env, "u1", "premium", { ...foreignAsk("Favori kim?") }, afterMidnight)
    ).toEqual({ ok: false, error: "RACE_NOT_FOUND" });
  });
});
