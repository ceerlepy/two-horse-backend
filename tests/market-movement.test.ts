import {
  describe,
  expect,
  it
} from "vitest";

import {
  analyzeMarketMovement
} from "../src/market/market-score";

describe(
  "AGF market movement",
  () => {
    it(
      "rewards sustained support",
      () => {
        const result =
          analyzeMarketMovement([
            {
              agfPercent: 8,
              capturedAt:
                "2026-08-19T12:00:00.000Z"
            },
            {
              agfPercent: 11,
              capturedAt:
                "2026-08-19T13:00:00.000Z"
            },
            {
              agfPercent: 17,
              capturedAt:
                "2026-08-19T14:00:00.000Z"
            }
          ]);

        expect(
          result.score!
        ).toBeGreaterThan(50);

        expect(
          result.direction
        ).toBe(
          "strong-up"
        );

        expect(
          result.absoluteDelta
        ).toBe(9);
      }
    );

    it(
      "penalizes lost support",
      () => {
        const result =
          analyzeMarketMovement([
            {
              agfPercent: 24,
              capturedAt:
                "2026-08-19T12:00:00.000Z"
            },
            {
              agfPercent: 18,
              capturedAt:
                "2026-08-19T13:00:00.000Z"
            },
            {
              agfPercent: 12,
              capturedAt:
                "2026-08-19T14:00:00.000Z"
            }
          ]);

        expect(
          result.score!
        ).toBeLessThan(50);

        expect(
          result.direction
        ).toBe(
          "strong-down"
        );
      }
    );

    it(
      "scores a stable market as neutral",
      () => {
        const result =
          analyzeMarketMovement([
            {
              agfPercent: 12,
              capturedAt:
                "2026-08-19T12:00:00.000Z"
            },
            {
              agfPercent: 12,
              capturedAt:
                "2026-08-19T13:00:00.000Z"
            }
          ]);

        expect(
          result.score
        ).toBe(50);

        expect(
          result.direction
        ).toBe(
          "flat"
        );
      }
    );

    it(
      "does not call one snapshot movement",
      () => {
        const result =
          analyzeMarketMovement([
            {
              agfPercent: 25,
              capturedAt:
                "2026-08-19T14:00:00.000Z"
            }
          ]);

        expect(
          result.score
        ).toBeNull();

        expect(
          result.direction
        ).toBe(
          "unknown"
        );
      }
    );

    it(
      "requires meaningful time separation",
      () => {
        const result =
          analyzeMarketMovement([
            {
              agfPercent: 10,
              capturedAt:
                "2026-08-19T14:00:00.000Z"
            },
            {
              agfPercent: 20,
              capturedAt:
                "2026-08-19T14:01:00.000Z"
            }
          ]);

        expect(
          result.score
        ).toBeNull();
      }
    );
  }
);
