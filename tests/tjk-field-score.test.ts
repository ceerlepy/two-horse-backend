import {
  describe,
  expect,
  it
} from "vitest";

import {
  scoreTjkFieldHistory,
  TJK_FIELD_SCORE_CONFIG
} from "../src/field/tjk-field-score";

import type {
  TjkFieldHistoryRow
} from "../src/field/tjk-performance-parser";


function row(
  daysAgo: number,
  finishPosition: number | null
): TjkFieldHistoryRow {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);

  return {
    horseName: "TEST HORSE",
    raceDate: date.toISOString(),
    venue: null,
    distanceMeters: null,
    track: null,
    finishPosition
  };
}


describe(
  "scoreTjkFieldHistory",
  () => {
    it(
      "returns null with no usable rows",
      () => {
        expect(
          scoreTjkFieldHistory([])
        ).toEqual({ score: null, sampleSize: 0 });
      }
    );

    it(
      "shrinks a single win toward neutral 50 (low reliability)",
      () => {
        const result =
          scoreTjkFieldHistory([row(1, 1)]);

        expect(result.sampleSize).toBe(1);
        // 1/3 reliability: 50 + (100-50)*(1/3) ~= 66.7
        expect(result.score).toBeGreaterThan(50);
        expect(result.score).toBeLessThan(70);
      }
    );

    it(
      "reaches full reliability once samples meet the divisor",
      () => {
        const result =
          scoreTjkFieldHistory([
            row(1, 1),
            row(2, 1),
            row(3, 1)
          ]);

        expect(result.sampleSize).toBe(3);
        expect(result.score).toBe(100);
      }
    );

    it(
      "caps considered history at recencyWeights.length, newest first",
      () => {
        const rows = Array.from(
          { length: 10 },
          (_, i) => row(i, 1)
        );

        const result =
          scoreTjkFieldHistory(rows);

        expect(result.sampleSize).toBe(
          TJK_FIELD_SCORE_CONFIG.recencyWeights.length
        );
      }
    );

    it(
      "treats position 0 and an out-of-table position the same as the unplaced floor",
      () => {
        const zero =
          scoreTjkFieldHistory([
            row(1, 0),
            row(2, 0),
            row(3, 0)
          ]);

        const outOfRange =
          scoreTjkFieldHistory([
            row(1, 15),
            row(2, 15),
            row(3, 15)
          ]);

        expect(zero.score).toBe(outOfRange.score);
      }
    );
  }
);
