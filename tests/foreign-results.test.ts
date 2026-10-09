import { afterEach, describe, expect, it, vi } from "vitest";

import {
  acceptedForeignResults,
  foreignCityId,
  foreignRaceStarts,
  getForeignResults,
  refreshForeignResultsIfDue
} from "../src/foreign/results";

import { createSqliteD1 } from "./helpers/sqlite-d1";

/*
 * The page itself is parsed by the domestic results parser, which has
 * its own fixture test; here it only has to hand back what TJK printed.
 */
const parsedRaces = vi.hoisted(() => ({ value: [] as any[] }));

vi.mock("../src/results/parser", () => ({
  parseOfficialResultsHtml: (_html: string, city: string, raceDate: string) => ({
    city, raceDate, races: parsedRaces.value
  })
}));


const SOURCE =
  "https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=82&QueryParameter_Tarih=08/10/2026&SehirAdi=Keeneland%20ABD&Era=today";

const programme = [
  { raceNumber: 1, time: "19:05", runners: [{ number: 1, name: "ALPHA (USA)" }, { number: 2, name: "BRAVO (USA)" }] },
  { raceNumber: 2, time: "23:40", runners: [{ number: 1, name: "CHARLIE (USA)" }, { number: 2, name: "DELTA (USA)" }] },
  { raceNumber: 3, time: "00:15", runners: [{ number: 1, name: "ECHO (USA)" }, { number: 2, name: "FOXTROT (USA)" }] }
];

afterEach(() => {
  vi.unstubAllGlobals();
});


describe("foreign results", () => {
  it("reads the SehirId the programme link carries", () => {
    expect(foreignCityId(SOURCE)).toBe("82");
    expect(foreignCityId("https://x")).toBeNull();
    expect(foreignCityId("not a url")).toBeNull();
  });

  it("rolls an American card's after-midnight races onto the next day", () => {
    const starts = foreignRaceStarts("2026-10-08", programme);
    expect(starts.get(1)?.toISOString()).toBe("2026-10-08T16:05:00.000Z");
    expect(starts.get(2)?.toISOString()).toBe("2026-10-08T20:40:00.000Z");
    expect(starts.get(3)?.toISOString()).toBe("2026-10-08T21:15:00.000Z");
  });

  it("keeps only final races whose winner is the programme's horse", () => {
    const accepted = acceptedForeignResults(
      [
        { raceNumber: 1, runners: [{ horseNumber: 2, horseName: "BRAVO", finishPosition: 1 }, { horseNumber: 1, horseName: "ALPHA", finishPosition: 2 }] },
        /* Not final yet. */
        { raceNumber: 2, runners: [{ horseNumber: 1, horseName: "CHARLIE", finishPosition: 0 }, { horseNumber: 2, horseName: "DELTA", finishPosition: 0 }] },
        /* Winner's name does not match the card: a different meeting's page. */
        { raceNumber: 3, runners: [{ horseNumber: 1, horseName: "ZULU", finishPosition: 1 }, { horseNumber: 2, horseName: "FOXTROT", finishPosition: 2 }] },
        /* Not on the card at all. */
        { raceNumber: 9, runners: [{ horseNumber: 1, horseName: "ALPHA", finishPosition: 1 }, { horseNumber: 2, horseName: "BRAVO", finishPosition: 2 }] }
      ],
      programme
    );

    expect(accepted.map(race => race.raceNumber)).toEqual([1]);
  });

  it("fetches a meeting once a race is due, stores it, and serves the top three", async () => {
    const env: any = {
      DB: createSqliteD1([
        "migrations/0034_foreign_meetings.sql",
        "migrations/0051_foreign_results.sql"
      ])
    };

    await env.DB.prepare(`CREATE TABLE refresh_state (
      pipeline_key TEXT PRIMARY KEY, last_success_at TEXT, last_attempt_at TEXT,
      next_allowed_at TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
      lease_until TEXT, last_error TEXT, updated_at TEXT
    )`).run();

    await env.DB.prepare("INSERT INTO foreign_meetings VALUES (?,?,?,?,?,?,?)")
      .bind("2026-10-08", "Keeneland ABD", "ABD", 4, JSON.stringify(programme), SOURCE, "2026-10-08T10:00:00Z")
      .run();

    parsedRaces.value = [
      { raceNumber: 1, runners: [
        { horseNumber: 2, horseName: "BRAVO (USA)", finishPosition: 1 },
        { horseNumber: 1, horseName: "ALPHA (USA)", finishPosition: 2 }
      ] }
    ];

    const fetched: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: any) => {
      fetched.push(String(input?.url ?? input));
      return new Response("<html><body>" + "x".repeat(2000) + "</body></html>", {
        status: 200, headers: { "content-type": "text/html" }
      });
    }));

    /* 19:30 Turkey time: race 1 has settled, races 2 and 3 have not started. */
    const now = new Date("2026-10-08T16:30:00Z");
    const first = await refreshForeignResultsIfDue(env, true, now);

    expect(first.meetings).toBe(1);
    expect(first.races).toBe(1);
    expect(fetched[0]).toContain("Sehir/GunlukYarisSonuclari");
    expect(fetched[0]).toContain("SehirId=82");

    const results = await getForeignResults(env, "2026-10-08");
    expect(results.get("Keeneland ABD")?.get(1)).toEqual([
      { number: 2, name: "BRAVO (USA)", position: 1 },
      { number: 1, name: "ALPHA (USA)", position: 2 }
    ]);

    /* Nothing new is due: no second fetch. */
    const second = await refreshForeignResultsIfDue(env, true, new Date("2026-10-08T17:00:00Z"));
    expect(second.meetings).toBe(0);
    expect(fetched.length).toBe(1);
  });
});
