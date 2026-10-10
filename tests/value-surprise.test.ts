import { describe, expect, it } from "vitest";

import { valueSurpriseNumber } from "../src/value-model/service";

function runner(horse_number: number, agf_percent: number | null, probability?: number, label?: "underrated" | "overrated" | null) {
  return {
    horse_number,
    agf_percent,
    ...(probability === undefined ? {} : { valueModel: { probability, label: label ?? null } })
  };
}

describe("value-model surprise", () => {
  it("picks the strongest underrated horse outside the AGF top three", () => {
    expect(valueSurpriseNumber([
      runner(1, 30, 0.3, null),
      runner(2, 20, 0.3, "underrated"),
      runner(3, 15, 0.1, null),
      runner(4, 10, 0.14, "underrated"),
      runner(5, 8, 0.12, "underrated"),
      runner(6, 5, 0.04, "overrated")
    ])).toBe(4);
  });

  it("returns null without an underrated outsider or with missing AGF", () => {
    expect(valueSurpriseNumber([
      runner(1, 40, 0.4), runner(2, 30, 0.3), runner(3, 20, 0.2), runner(4, 10, 0.1, null)
    ])).toBeNull();
    expect(valueSurpriseNumber([
      runner(1, 40), runner(2, 30), runner(3, 20), runner(4, null, 0.2, "underrated")
    ])).toBeNull();
  });
});
