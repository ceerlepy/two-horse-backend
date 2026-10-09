import { describe, expect, it } from "vitest";

import {
  isAgfPending,
  markAgfPending
} from "../src/api/agf-pending";

import {
  foreignCardStillRunning,
  previousDate
} from "../src/foreign/results";

import { shrinkTowardMiddle } from "../src/scoring/race-score";

const runner = (number: number, agf: number | null) => ({
  horse_number: number,
  agf_percent: agf,
  modelScore: { score: 70 }
});

describe("AGF pending", () => {
  it("is pending only when no runner has AGF", () => {
    expect(isAgfPending({ runners: [runner(1, null), runner(2, null)] })).toBe(true);
    expect(isAgfPending({ runners: [runner(1, 0), runner(2, null)] })).toBe(false);
    expect(isAgfPending({ runners: [] })).toBe(false);
  });

  it("flags the race and leaves its scores alone", () => {
    const [meeting] = markAgfPending([
      {
        races: [
          { race_number: 1, runners: [runner(1, null), runner(2, null)] },
          { race_number: 2, runners: [runner(1, 40), runner(2, 60)] }
        ]
      }
    ]);

    expect(meeting.races[0].agfPending).toBe(true);
    expect(meeting.races[0].runners[0].modelScore.score).toBe(70);
    expect(meeting.races[1].agfPending).toBeUndefined();
  });
});

describe("late foreign cards", () => {
  it("steps back one calendar day", () => {
    expect(previousDate("2026-10-10")).toBe("2026-10-09");
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
  });

  it("keeps yesterday's American card while a race is still to come", () => {
    // 9 Oct card, last race 03:30 Turkey time (rolls into 10 Oct).
    const races = [
      { raceNumber: 1, time: "19:00" },
      { raceNumber: 2, time: "23:30" },
      { raceNumber: 3, time: "03:30" }
    ];

    // 01:15 Turkey time on 10 Oct = 22:15 UTC on 9 Oct.
    expect(foreignCardStillRunning("2026-10-09", races, new Date("2026-10-09T22:15:00Z"))).toBe(true);
    // 05:00 Turkey time: last race over for more than an hour.
    expect(foreignCardStillRunning("2026-10-09", races, new Date("2026-10-10T02:00:00Z"))).toBe(false);
  });
});


describe("no-AGF score", () => {
  it("pulls thin-data scores toward the middle", () => {
    expect(shrinkTowardMiddle(100, 0.4)).toBe(70);
    expect(shrinkTowardMiddle(100, 0.9)).toBe(95);
    expect(shrinkTowardMiddle(30, 0.4)).toBe(42);
    expect(shrinkTowardMiddle(80, 0)).toBe(50);
    expect(shrinkTowardMiddle(80, 1.2)).toBe(80);
  });
});
