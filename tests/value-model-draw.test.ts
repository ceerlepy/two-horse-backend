import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { parseTjkMeetingPage } from "../src/tjk/html-parser";
import { parseArchiveMeeting } from "../src/value-model/archive-parser";
import { ARCHIVE_CONFIG, pendingArchiveDates } from "../src/value-model/archive-service";
import { computeFeatures, drawBucket, drawKey, type FeatureContext } from "../src/value-model/features";

describe("start position", () => {
  it("is read from the program's St column", () => {
    const html = `
      <h3>1. Koşu 17.00</h3><h3>1200 Kum</h3>
      <table>
        <tr><th>No</th><th>At İsmi</th><th>Sıklet</th><th>Jokey</th><th>St</th><th>HP</th><th>AGF</th></tr>
        <tr><td>1</td><td><a>ALFA</a></td><td>58</td><td><a>J A</a></td><td>7</td><td>75</td><td>%30</td></tr>
        <tr><td>2</td><td><a>BRAVO</a></td><td>57</td><td><a>J B</a></td><td>2</td><td>68</td><td>%20</td></tr>
      </table>`;
    const runners = parseTjkMeetingPage(html, "İstanbul").races[0].runners;
    expect(runners.map(r => [r.number, r.startPosition])).toEqual([[1, 7], [2, 2]]);
  });

  it("is read from the result page for every starter", () => {
    const html = gunzipSync(
      readFileSync(new URL("./fixtures/tjk-results-adana-2026-09-20.html.gz", import.meta.url))
    ).toString("utf-8");
    const meeting = parseArchiveMeeting(html);
    for (const race of meeting.races) {
      const starts = meeting.runners.filter(r => r.raceCode === race.raceCode).map(r => r.startPosition);
      expect(starts.every(s => s != null && s >= 1)).toBe(true);
      expect(new Set(starts).size).toBe(starts.length);
    }
  });
});

describe("draw bias feature", () => {
  it("groups by hippodrome, surface, sprint/route and gate bucket", () => {
    expect([1, 2, 3, 4, 5, 7, 8, 14].map(drawBucket)).toEqual(["1-2", "1-2", "3-4", "3-4", "5-7", "5-7", "8+", "8+"]);
    expect(drawKey(3, "Çim", 1400, 1)).toBe("3|Çim|1|1-2");
    expect(drawKey(3, "Çim", 1500, 9)).toBe("3|Çim|0|8+");
  });

  it("is the shrunk A/E relative to the field, null without a start position", () => {
    const ctx: FeatureContext = {
      raceDate: "2026-10-05", distanceMeters: 1200, surface: "Kum", history: new Map(), jockeys: new Map(),
      gallops: null, cityId: 1,
      drawStats: new Map([["1|Kum|1|1-2", { wins: 60, expected: 30 }], ["1|Kum|1|8+", { wins: 10, expected: 40 }]])
    };
    const runner = (n: number, startPosition: number | null) =>
      ({ horseNumber: n, horseId: null, jockeyId: null, weight: null, agfPercent: null, odds: null, startPosition });
    const f = computeFeatures(ctx, [runner(1, 1), runner(2, 9), runner(3, null)]);
    // (60+30)/(30+30)=1.5 and (10+30)/(40+30)=0.5714; field mean 1.0357
    expect(f[0].draw_ae_rel).toBeCloseTo(1.5 - (1.5 + 40 / 70) / 2, 9);
    expect(f[1].draw_ae_rel).toBeCloseTo(40 / 70 - (1.5 + 40 / 70) / 2, 9);
    expect(f[2].draw_ae_rel).toBeNull();
  });
});

describe("archive revision", () => {
  const env = (rows: any[]) => ({
    DB: { prepare: () => ({ all: async () => ({ results: rows }) }) }
  }) as any;

  it("re-fetches older-revision dates newest first, after missing dates", async () => {
    const old = "2026-01-01T00:00:00Z";
    // backfill starts 2024-07-01: 07-05 is missing, 07-04 is current, 07-03..07-01 are revision 1
    const rows = [
      { race_date: "2024-07-04", status: "done", attempts: 1, updated_at: old, revision: ARCHIVE_CONFIG.revision },
      { race_date: "2024-07-03", status: "done", attempts: 1, updated_at: old, revision: 1 },
      { race_date: "2024-07-02", status: "done", attempts: 1, updated_at: old, revision: 1 },
      { race_date: "2024-07-01", status: "done", attempts: 1, updated_at: new Date().toISOString(), revision: 1 }
    ];
    expect(await pendingArchiveDates(env(rows), 3, "2024-07-06", 12)).toEqual(["2024-07-05", "2024-07-03", "2024-07-02"]);
    expect(await pendingArchiveDates(env(rows), 1, "2024-07-06", 12)).toEqual(["2024-07-05"]);
  });
});
