import { describe, expect, it } from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";
import { formCandidates, raceFormRuns } from "../src/form/repository";
import { addDays } from "../src/tjk/next-day-service";
import { turkeyDate } from "../src/shared";
import { findNextDayRace } from "../src/tjk/next-day-service";

/* Tomorrow's race screen reads recent runs through the stored D+1 card. */
async function env(): Promise<any> {
  const DB = createSqliteD1(["migrations/0048_next_day_program.sql"]);
  await DB.prepare(`CREATE TABLE runners (race_date TEXT, city TEXT, race_number INTEGER,
    horse_number INTEGER, horse_name TEXT, horse_profile_url TEXT, recent_form_raw TEXT)`).run();
  await DB.prepare(`CREATE TABLE horse_form_history (horse_key TEXT, horse_name TEXT, race_date TEXT,
    city TEXT, distance_meters INTEGER, track TEXT, finish_position INTEGER, weight REAL,
    jockey TEXT, odds REAL, hp INTEGER, source_url TEXT, fetched_at TEXT)`).run();
  const card = {
    date: "2026-10-12",
    meetings: [{
      city: "Bursa",
      races: [{
        race_number: 1, start_time: "14:30", starts_at: null, distance_meters: 1400, track: "Çim",
        performance_url: "https://www.tjk.org/perf",
        runners: [{
          horse_number: 1, horse_name: "SILA ALEYNA", jockey: null, weight: 60, hp: 35,
          recent_form_raw: "222", start_position: 7,
          horse_profile_url: "https://www.tjk.org/TR/YarisSever/Query/ConnectedPage/AtKosuBilgileri?QueryParameter_AtId=12345"
        }]
      }]
    }]
  };
  await DB.prepare("INSERT INTO next_day_programs VALUES ('2026-10-12', ?, 'x')").bind(JSON.stringify(card)).run();
  return { DB };
}

describe("tomorrow's race screen", () => {
  it("finds the stored race by date, city and number", async () => {
    const e = await env();
    expect((await findNextDayRace(e, "2026-10-12", "bursa", 1))?.performance_url).toBe("https://www.tjk.org/perf");
    expect(await findNextDayRace(e, "2026-10-12", "Bursa", 2)).toBeNull();
    expect(await findNextDayRace(e, "2026-10-13", "Bursa", 1)).toBeNull();
  });

  it("reads recent runs through the card's horse link when runners has no row", async () => {
    const e = await env();
    await e.DB.prepare(`INSERT INTO horse_form_history (horse_key, horse_name, race_date, city, distance_meters,
      track, finish_position, source_url, fetched_at) VALUES ('tjk:12345', 'SILA ALEYNA', '2026-09-30', 'Bursa', 1400, 'Çim', 2, 'u', 'x')`).run();
    const { runners, runs } = await raceFormRuns(e, "2026-10-12", "Bursa", 1, 5);
    expect(runners).toEqual([{ horseNumber: 1, horseName: "SILA ALEYNA", horseKey: "tjk:12345" }]);
    expect(runs.get("tjk:12345")?.map(run => run.raceDate)).toEqual(["2026-09-30"]);
  });

  it("queues tomorrow's horses for recent-run collection after today's", async () => {
    const e = await env();
    await e.DB.prepare(`CREATE TABLE races (race_date TEXT, city TEXT, race_number INTEGER, starts_at TEXT)`).run();
    await e.DB.prepare(`CREATE TABLE horse_form_refresh_state (horse_key TEXT, status TEXT,
      last_attempt_at TEXT, last_success_at TEXT, updated_at TEXT)`).run();
    await e.DB.prepare("UPDATE next_day_programs SET race_date = ?").bind(addDays(turkeyDate(), 1)).run();
    await e.DB.prepare(`INSERT INTO runners VALUES (?, 'Adana', 1, 2, 'TODAY HORSE',
      'https://www.tjk.org/x?QueryParameter_AtId=777', '1')`).bind(turkeyDate()).run();
    const candidates = await formCandidates(e, { limit: 10, refreshAfterMinutes: 60, retryFailedAfterMinutes: 60 });
    expect(candidates.map(c => c.horseKey)).toEqual(["tjk:777", "tjk:12345"]);
  });
});
