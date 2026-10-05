import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";
import { TJK_BROWSER_USER_AGENT } from "../src/acquisition/http";
import {
  buildCityUrl,
  buildMasterUrl,
  canonicalizeMeetingUrl,
  extractTjkProgramForDate,
  turkeyDateParts
} from "../src/tjk/extraction-pipeline";
import {
  addDays,
  isTodayOver,
  loadNextDayProgram,
  nextDayForToday,
  refreshNextDayProgramIfDue
} from "../src/tjk/next-day-service";
import type { TjkProgramInput } from "../src/types/models";

/* 2026-10-05 18:00 Turkey time (UTC+3). */
const EVENING = new Date("2026-10-05T15:00:00Z");
/* 2026-10-05 09:00 Turkey time. */
const MORNING = new Date("2026-10-05T06:00:00Z");

async function testEnv(): Promise<any> {
  const env: any = {
    DB: createSqliteD1(["migrations/0048_next_day_program.sql"])
  };
  await env.DB.prepare(`CREATE TABLE refresh_state (
    pipeline_key TEXT PRIMARY KEY, last_success_at TEXT, last_attempt_at TEXT,
    next_allowed_at TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
    lease_until TEXT, last_error TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  for (const table of ["meetings", "races", "runners", "agf_snapshots"]) {
    await env.DB.prepare(`CREATE TABLE ${table} (race_date TEXT, city TEXT)`).run();
  }
  return env;
}

const program: TjkProgramInput = {
  raceDate: "2026-10-06",
  meetings: [{
    city: "Bursa",
    races: [{
      raceNumber: 1,
      time: "14:30",
      distanceMeters: 1400,
      track: "Kum",
      performanceUrl: "https://www.tjk.org/perf",
      sixfoldStartNumbers: [1],
      runners: [{
        number: 3,
        name: "RÜZGAR",
        jockey: "A. ÇELİK",
        weight: 57,
        hp: 62,
        agfPercent: null,
        recentFormRaw: "3223-66",
        horseProfileUrl: "https://www.tjk.org/horse",
        jockeyProfileUrl: "https://www.tjk.org/jockey",
        startPosition: 5
      }]
    }]
  }]
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("date-parameterised TJK URL builders", () => {
  it("default to today and accept an explicit card date", () => {
    expect(turkeyDateParts("2026-10-06")).toEqual({ yyyyMMdd: "2026-10-06", ddMMyyyy: "06/10/2026" });
    expect(() => turkeyDateParts("06/10/2026")).toThrow(/INVALID_CARD_DATE/);

    const master = new URL(buildMasterUrl("2026-10-06"));
    expect(master.searchParams.get("QueryParameter_Tarih")).toBe("06/10/2026");

    const city = new URL(buildCityUrl("Bursa", "2026-10-06"));
    expect(city.searchParams.get("QueryParameter_Tarih")).toBe("06/10/2026");
    expect(city.searchParams.get("SehirAdi")).toBe("Bursa");

    const canonical = new URL(canonicalizeMeetingUrl(
      "?QueryParameter_Tarih=05/10/2026&SehirId=3&SehirAdi=Bursa",
      "2026-10-06"
    ));
    expect(canonical.searchParams.get("QueryParameter_Tarih")).toBe("06/10/2026");
    expect(canonical.searchParams.get("SehirId")).toBe("3");

    const today = turkeyDateParts().ddMMyyyy;
    expect(new URL(buildMasterUrl()).searchParams.get("QueryParameter_Tarih")).toBe(today);
  });
});

describe("extractTjkProgramForDate", () => {
  it("returns no program when TJK has not published the card, over HTTP with the browser UA", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(`<html><body>${"<!-- yok -->".repeat(200)}</body></html>`, { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const env: any = { BROWSER: { quickAction: vi.fn() }, AI: { run: vi.fn() } };
    const result = await extractTjkProgramForDate(env, "2026-10-06");

    expect(result.program).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("QueryParameter_Tarih")).toBe("06/10/2026");
    expect((init.headers as Record<string, string>)["user-agent"]).toBe(TJK_BROWSER_USER_AGENT);
    expect(env.BROWSER.quickAction).not.toHaveBeenCalled();
  });
});

describe("refreshNextDayProgramIfDue", () => {
  it("does nothing before noon Turkey time", async () => {
    const env = await testEnv();
    const extract = vi.fn();
    const result = await refreshNextDayProgramIfDue(env, { now: MORNING, extract });
    expect(result.reason).toBe("before-window");
    expect(extract).not.toHaveBeenCalled();
  });

  it("treats an unpublished card as 'not yet' and retries in about an hour", async () => {
    const env = await testEnv();
    const extract = vi.fn(async () => ({ program: null, diagnostics: [] }));

    const result = await refreshNextDayProgramIfDue(env, { now: EVENING, extract });
    expect(result).toEqual({ refreshed: false, reason: "not-published", date: "2026-10-06" });
    expect(extract).toHaveBeenCalledWith(env, "2026-10-06");

    const state = await env.DB.prepare("SELECT * FROM refresh_state WHERE pipeline_key='tjk:next-day-program'").first();
    expect(state.failure_count).toBe(0);
    expect(state.last_error).toBeNull();
    expect(Date.parse(state.next_allowed_at) - Date.now()).toBeGreaterThan(50 * 60_000);
    expect(await loadNextDayProgram(env, "2026-10-06")).toBeNull();
  });

  it("stores the compact card without touching races, runners or AGF, and prunes past dates", async () => {
    const env = await testEnv();
    await env.DB.prepare("INSERT INTO next_day_programs VALUES ('2026-10-04', '{}', 'x')").run();
    const extract = vi.fn(async () => ({ program, diagnostics: [] }));

    const result = await refreshNextDayProgramIfDue(env, { now: EVENING, extract });
    expect(result.refreshed).toBe(true);

    const stored = await loadNextDayProgram(env, "2026-10-06");
    expect(stored).toEqual({
      date: "2026-10-06",
      meetings: [{
        city: "Bursa",
        races: [{
          race_number: 1,
          start_time: "14:30",
          starts_at: "2026-10-06T11:30:00.000Z",
          distance_meters: 1400,
          track: "Kum",
          sixfold_start_numbers: [1],
          runners: [{
            horse_number: 3,
            horse_name: "RÜZGAR",
            jockey: "A. ÇELİK",
            weight: 57,
            hp: 62,
            recent_form_raw: "3223-66",
            start_position: 5
          }]
        }]
      }]
    });
    expect(JSON.stringify(stored)).not.toMatch(/tjk\.org|agf/i);

    for (const table of ["meetings", "races", "runners", "agf_snapshots"]) {
      const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first();
      expect(count.n).toBe(0);
    }
    const old = await env.DB.prepare("SELECT COUNT(*) AS n FROM next_day_programs WHERE race_date < '2026-10-05'").first();
    expect(old.n).toBe(0);

    // Fresh within the TTL.
    const again = await refreshNextDayProgramIfDue(env, { now: EVENING, extract });
    expect(again.reason).toBe("fresh");
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("never reaches the live-program writers", () => {
    const source = readFileSync("src/tjk/next-day-service.ts", "utf8");
    expect(source).not.toMatch(/recordAgfSnapshots|upsertProgram|INSERT INTO (races|runners|meetings)/);
  });
});

describe("/api/today nextDay", () => {
  const race = (startsAt: string) => ({ race_number: 1, starts_at: startsAt });

  it("is present only when today's last race has started", async () => {
    const env = await testEnv();
    await refreshNextDayProgramIfDue(env, {
      now: EVENING,
      extract: async () => ({ program, diagnostics: [] })
    });

    const running = [{ city: "Adana", races: [race("2026-10-05T14:00:00.000Z"), race("2026-10-05T15:30:00.000Z")] }];
    const finished = [{ city: "Adana", races: [race("2026-10-05T14:00:00.000Z"), race("2026-10-05T14:58:00.000Z")] }];
    const justStarted = [{ city: "Adana", races: [race("2026-10-05T14:59:30.000Z")] }];

    expect(isTodayOver(running, EVENING)).toBe(false);
    expect(isTodayOver(justStarted, EVENING)).toBe(false);
    expect(isTodayOver(finished, EVENING)).toBe(true);
    expect(isTodayOver([], EVENING)).toBe(true);

    expect(await nextDayForToday(env, running, EVENING)).toBeNull();
    expect((await nextDayForToday(env, finished, EVENING))?.date).toBe("2026-10-06");
    expect((await nextDayForToday(env, [], EVENING))?.meetings[0].city).toBe("Bursa");

    const emptyEnv = await testEnv();
    expect(await nextDayForToday(emptyEnv, finished, EVENING)).toBeNull();
  });

  it("is wired into the /api/today response", () => {
    const router = readFileSync("src/api/router.ts", "utf8");
    expect(router).toMatch(/\.\.\.\(nextDay\?\{nextDay\}:\{\}\)/);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
