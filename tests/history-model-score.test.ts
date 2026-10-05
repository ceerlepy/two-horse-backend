import { describe, expect, it } from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";
import { getHistory } from "../src/history/service";
import { turkeyDate } from "../src/shared";

describe("history", () => {
  it("ranks frozen runners by the score the model had, not by horse number", async () => {
    const env: any = { DB: createSqliteD1([]) };
    await env.DB.prepare(
      "CREATE TABLE race_history (race_date TEXT, city TEXT, race_number INTEGER, snapshot_json TEXT, finalized_at TEXT)"
    ).run();
    await env.DB.prepare(
      "CREATE TABLE learning_runner_features (race_date TEXT, city TEXT, race_number INTEGER, horse_number INTEGER, finish_position INTEGER, model_score REAL)"
    ).run();

    const date = turkeyDate();
    const snapshot = {
      raceDate: date,
      city: "Bursa",
      raceNumber: 1,
      runners: [{ horse_number: 1 }, { horse_number: 2 }, { horse_number: 3 }]
    };
    await env.DB.prepare("INSERT INTO race_history VALUES (?, 'Bursa', 1, ?, '')")
      .bind(date, JSON.stringify(snapshot)).run();
    for (const [horse, finish, score] of [[1, 8, 51.2], [2, 1, 64.4], [3, 3, null]]) {
      await env.DB.prepare("INSERT INTO learning_runner_features VALUES (?, 'Bursa', 1, ?, ?, ?)")
        .bind(date, horse, finish, score).run();
    }

    const { entries } = await getHistory(env);
    expect(entries[0].resultAvailable).toBe(true);
    expect(entries[0].runners).toEqual([
      { horse_number: 1, finishPosition: 8, modelScore: { score: 51.2 } },
      { horse_number: 2, finishPosition: 1, modelScore: { score: 64.4 } },
      { horse_number: 3, finishPosition: 3, modelScore: null }
    ]);
  });
});
