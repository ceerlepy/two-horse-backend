import {
  describe,
  expect,
  it
} from "vitest";

import {
  aggregateExpertPredictions
} from "../src/experts/aggregator";

describe(
  "expert aggregator",
  () => {
    it(
      "does not multi-count correlated labels from one source",
      () => {
        const result =
          aggregateExpertPredictions([
            {
              source_key: "a",
              source_type:
                "editorial",
              base_weight: 1,

              confidence: 1,
              source_rank: 1,

              is_favorite: 1,
              is_banko: 1,
              is_strong: 1,
              is_star: 1,

              is_rival: 0,
              is_surprise: 0,
              is_avoid: 0
            }
          ]);

        expect(
          result.sourceCount
        ).toBe(1);

        expect(
          result.weightedSupport
        ).toBeCloseTo(
          1,
          3
        );
      }
    );

    it(
      "weights editorial above lower-prior crowd signal",
      () => {
        const result =
          aggregateExpertPredictions([
            {
              source_key:
                "editorial",

              source_type:
                "editorial",

              base_weight: 1,
              confidence: 1,
              source_rank: 1,

              is_favorite: 1,
              is_banko: 0,
              is_strong: 0,
              is_star: 0,
              is_rival: 0,
              is_surprise: 0,
              is_avoid: 0
            },

            {
              source_key:
                "crowd",

              source_type:
                "crowd",

              base_weight: 0.55,
              confidence: 1,
              source_rank: 1,

              is_favorite: 0,
              is_banko: 0,
              is_strong: 0,
              is_star: 0,
              is_rival: 0,
              is_surprise: 1,
              is_avoid: 0
            }
          ]);

        expect(
          result.weightedFavorite
        ).toBeGreaterThan(
          result.weightedSurprise
        );
      }
    );

    it(
      "penalizes explicit avoid opinion",
      () => {
        const positive =
          aggregateExpertPredictions([
            {
              source_key: "a",
              source_type:
                "editorial",
              base_weight: 1,
              confidence: 1,
              source_rank: 1,

              is_favorite: 1,
              is_banko: 0,
              is_strong: 0,
              is_star: 0,
              is_rival: 0,
              is_surprise: 0,
              is_avoid: 0
            }
          ]);

        const opposed =
          aggregateExpertPredictions([
            {
              source_key: "a",
              source_type:
                "editorial",
              base_weight: 1,
              confidence: 1,
              source_rank: 1,

              is_favorite: 1,
              is_banko: 0,
              is_strong: 0,
              is_star: 0,
              is_rival: 0,
              is_surprise: 0,
              is_avoid: 0
            },

            {
              source_key: "b",
              source_type:
                "editorial",
              base_weight: 1,
              confidence: 1,
              source_rank: 1,

              is_favorite: 0,
              is_banko: 0,
              is_strong: 0,
              is_star: 0,
              is_rival: 0,
              is_surprise: 0,
              is_avoid: 1
            }
          ]);

        expect(
          opposed.expertScore
        ).toBeLessThan(
          positive.expertScore
        );
      }
    );
  }
);
