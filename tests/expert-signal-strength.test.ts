import {
  describe,
  expect,
  it
} from "vitest";

import {
  strongestPositiveSignal
} from "../src/experts/signal-policy";

import type {
  ExpertPredictionRow
} from "../src/experts/aggregation-types";


function prediction(
  overrides: Partial<ExpertPredictionRow> = {}
): ExpertPredictionRow {
  return {
    source_key: "test",
    source_type: null,
    base_weight: null,
    confidence: null,
    source_rank: null,
    is_favorite: 0,
    is_banko: 0,
    is_strong: 0,
    is_star: 0,
    is_rival: 0,
    is_surprise: 0,
    is_avoid: 0,
    ...overrides
  };
}


describe(
  "strongestPositiveSignal",
  () => {
    it(
      "returns 0 when no positive flag is set",
      () => {
        expect(
          strongestPositiveSignal(prediction())
        ).toBe(0);
      }
    );

    it(
      "prefers banko over every other flag",
      () => {
        expect(
          strongestPositiveSignal(
            prediction({ is_banko: 1, is_favorite: 1, is_surprise: 1 })
          )
        ).toBe(1.00);
      }
    );

    it(
      "ranks favorite above strong above star above rival above surprise",
      () => {
        expect(
          strongestPositiveSignal(prediction({ is_favorite: 1 }))
        ).toBe(0.86);

        expect(
          strongestPositiveSignal(prediction({ is_strong: 1 }))
        ).toBe(0.74);

        expect(
          strongestPositiveSignal(prediction({ is_star: 1 }))
        ).toBe(0.68);

        expect(
          strongestPositiveSignal(prediction({ is_rival: 1 }))
        ).toBe(0.46);

        expect(
          strongestPositiveSignal(prediction({ is_surprise: 1 }))
        ).toBe(0.30);
      }
    );

    it(
      "treats string '1' the same as boolean/numeric truthy flags",
      () => {
        expect(
          strongestPositiveSignal(
            prediction({ is_star: "1" as unknown as number })
          )
        ).toBe(0.68);
      }
    );
  }
);
