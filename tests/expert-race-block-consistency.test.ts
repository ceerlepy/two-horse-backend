import {
  describe,
  expect,
  it
} from "vitest";

import {
  planExpertRaceBlocks
} from "../src/experts/validator";

import type {
  ExpertPickInput
} from "../src/types/models";


function field(
  city: string,
  raceNumber: number,
  size: number
) {
  return Array.from(
    { length: size },
    (_, index) => ({
      city,
      raceNumber,
      horseNumber:
        index + 1,
      horseName:
        `${city.toUpperCase()} R${raceNumber} AT ${index + 1}`
    })
  );
}


function pick(
  city: string,
  raceNumber: number,
  horseNumber: number,
  horseName: string | null = null
): ExpertPickInput {
  return {
    city,
    raceNumber,
    horseNumber,
    horseName,
    comment: null,
    isFavorite: false,
    isBanko: false,
    isStrong: horseName !== null,
    isStar: false,
    isRival: horseName === null,
    isSurprise: false,
    isAvoid: false,
    sourceRank: null,
    confidence: 0.85
  };
}


/*
 * Mirrors live 2026-10-04: Adana 6 had 8 runners, İstanbul 6 had 13.
 */
const runners = [
  ...field("Adana", 6, 8),
  ...field("İstanbul", 6, 13)
];


describe(
  "expert race-block consistency",
  () => {
    it(
      "leaves a fully resolvable race group untouched",
      () => {
        const decisions =
          planExpertRaceBlocks(
            runners,
            [
              pick("Adana", 6, 2),
              pick("Adana", 6, 5)
            ]
          );

        expect(
          decisions.map(
            decision => decision.kind
          )
        ).toEqual([
          "accepted",
          "accepted"
        ]);
      }
    );

    it(
      "drops the whole number-only group when one number is impossible",
      () => {
        const decisions =
          planExpertRaceBlocks(
            runners,
            [
              pick("Adana", 6, 9),
              pick("Adana", 6, 12),
              pick("Adana", 6, 3)
            ]
          );

        expect(
          decisions.every(
            decision => decision.kind === "rejected"
          )
        ).toBe(true);

        expect(
          decisions.map(
            decision =>
              decision.kind === "rejected"
                ? decision.reason
                : null
          )
        ).toEqual([
          "EXPERT_CANONICAL_IDENTITY_NOT_FOUND",
          "EXPERT_CANONICAL_IDENTITY_NOT_FOUND",
          "EXPERT_RACE_BLOCK_UNTRUSTED"
        ]);
      }
    );

    it(
      "moves a group to the only city whose names and numbers all match",
      () => {
        const decisions =
          planExpertRaceBlocks(
            runners,
            [
              pick("Adana", 6, 11, "İSTANBUL R6 AT 11"),
              pick("Adana", 6, 13),
              pick("Adana", 6, 4)
            ]
          );

        expect(
          decisions.every(
            decision => decision.kind === "accepted"
          )
        ).toBe(true);

        for (const decision of decisions) {
          if (decision.kind !== "accepted") {
            continue;
          }

          expect(decision.runner.city).toBe("İstanbul");
          expect(decision.relocatedFrom).toBe("Adana");
        }
      }
    );

    it(
      "keeps only name-verified picks when no single city fits",
      () => {
        const decisions =
          planExpertRaceBlocks(
            runners,
            [
              pick("Adana", 6, 1, "ADANA R6 AT 1"),
              pick("Adana", 6, 4),
              pick("Adana", 6, 20)
            ]
          );

        expect(
          decisions.map(
            decision => decision.kind
          )
        ).toEqual([
          "accepted",
          "rejected",
          "rejected"
        ]);
      }
    );
  }
);
