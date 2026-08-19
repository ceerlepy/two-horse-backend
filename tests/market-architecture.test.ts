import {
  describe,
  expect,
  it
} from "vitest";

import {
  scoreMarketMovement
} from "../src/market/market-score";

describe(
  "market architecture",
  () => {
    it(
      "does not require a high current AGF to detect support",
      () => {
        const score =
          scoreMarketMovement([
            {
              agfPercent: 4,
              capturedAt:
                "2026-08-19T12:00:00.000Z"
            },
            {
              agfPercent: 8,
              capturedAt:
                "2026-08-19T13:00:00.000Z"
            }
          ]);

        expect(score)
          .not.toBeNull();

        expect(score!)
          .toBeGreaterThan(50);
      }
    );
  }
);
