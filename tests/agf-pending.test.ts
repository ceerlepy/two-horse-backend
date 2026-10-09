import { describe, expect, it } from "vitest";

import {
  hideScoresUntilAgf,
  isAgfPending
} from "../src/api/agf-pending";

const runner = (number: number, agf: number | null) => ({
  horse_number: number,
  agf_percent: agf,
  modelScore: { score: 70, confidence: 0.6, winProbability: null }
});

describe("AGF pending", () => {
  it("is pending only when no runner has AGF", () => {
    expect(isAgfPending({ runners: [runner(1, null), runner(2, null)] })).toBe(true);
    expect(isAgfPending({ runners: [runner(1, 0), runner(2, null)] })).toBe(false);
    expect(isAgfPending({ runners: [] })).toBe(false);
  });

  it("drops scores, uncertainty and strategy until AGF opens", () => {
    const [meeting] = hideScoresUntilAgf([
      {
        city: "Ankara",
        races: [
          {
            race_number: 1,
            uncertainty: { level: "low" },
            couponStrategy: { mode: "single" },
            runners: [runner(1, null), runner(2, null)]
          },
          {
            race_number: 2,
            uncertainty: { level: "low" },
            runners: [runner(1, 40), runner(2, 60)]
          }
        ]
      }
    ]);

    const [pending, open] = meeting.races;

    expect(pending.agfPending).toBe(true);
    expect(pending.uncertainty).toBeNull();
    expect(pending.couponStrategy).toBeNull();
    expect(pending.runners[0].modelScore.score).toBeNull();
    expect(open.agfPending).toBeUndefined();
    expect(open.runners[0].modelScore.score).toBe(70);
  });
});
