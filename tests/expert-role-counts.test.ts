import { describe, expect, it } from "vitest";

import { aggregateExpertPredictions } from "../src/experts/aggregator";

const row = (
  source: string,
  flags: Partial<Record<
    | "is_favorite" | "is_banko" | "is_strong" | "is_star"
    | "is_rival" | "is_surprise" | "is_avoid",
    number
  >>
) => ({
  source_key: source,
  source_type: "editorial",
  base_weight: 1,
  confidence: 1,
  source_rank: 1,
  is_favorite: 0,
  is_banko: 0,
  is_strong: 0,
  is_star: 0,
  is_rival: 0,
  is_surprise: 0,
  is_avoid: 0,
  ...flags
});

describe("expert role counts", () => {
  it("counts each source once by its strongest role", () => {
    const result = aggregateExpertPredictions([
      row("a", { is_favorite: 1, is_banko: 1 }),
      row("b", { is_strong: 1, is_rival: 1 }),
      row("c", { is_rival: 1 }),
      row("d", { is_surprise: 1 }),
      row("e", { is_avoid: 1, is_rival: 1 })
    ]);

    expect(result.primaryCount).toBe(2);
    expect(result.secondaryCount).toBe(1);
    expect(result.surpriseOnlyCount).toBe(1);
    expect(result.avoidCount).toBe(1);
    expect(result.sourceCount).toBe(5);
  });
});
