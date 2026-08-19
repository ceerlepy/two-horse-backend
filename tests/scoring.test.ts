import {
  describe,
  expect,
  it
} from "vitest";

import {
  scoreRace,
  raceUncertainty
} from "../src/scoring/race-score";

function consensus(
  expertScore: number,
  sourceCount = 3,
  supportConfidence = 0.7
) {
  return {
    sourceCount,

    bankoCount: 0,
    favoriteCount: 0,
    strongCount: 0,
    starCount: 0,
    rivalCount: 0,
    surpriseCount: 0,
    avoidCount: 0,

    weightedBanko: 0,
    weightedFavorite: 0,
    weightedStrong: 0,
    weightedStar: 0,
    weightedRival: 0,
    weightedSurprise: 0,
    weightedAvoid: 0,

    weightedSupport: 0,
    weightedOpposition: 0,

    expertScore,
    supportConfidence,

    labels: []
  };
}

describe(
  "horse scoring",
  () => {
    it(
      "scores stronger available signals higher",
      () => {
        const scored =
          scoreRace([
            {
              horse_number: 1,
              agf_percent: 45,
              hp: 95,
              weight: 56,

              expertConsensus:
                consensus(85)
            },

            {
              horse_number: 2,
              agf_percent: 15,
              hp: 65,
              weight: 60,

              expertConsensus:
                consensus(55)
            }
          ]);

        expect(
          scored[0]
            .modelScore.score
        ).toBeGreaterThan(
          scored[1]
            .modelScore.score
        );
      }
    );

    it(
      "renormalizes unavailable future signals instead of treating them as zero",
      () => {
        const scored =
          scoreRace([
            {
              horse_number: 1,
              agf_percent: 50,
              hp: 80,
              weight: 58,

              expertConsensus:
                consensus(80)
            }
          ]);

        expect(
          scored[0]
            .modelScore.score
        ).toBeGreaterThan(0);

        expect(
          scored[0]
            .modelScore.confidence
        ).toBeLessThan(1);

        const form =
          scored[0]
            .modelScore.components
            .find(
              x =>
                x.key === "form"
            );

        expect(
          form?.score
        ).toBeNull();

        expect(
          form?.effectiveWeight
        ).toBe(0);
      }
    );
  }
);

describe(
  "race uncertainty",
  () => {
    it(
      "marks a close top two as more uncertain",
      () => {
        const close =
          scoreRace([
            {
              horse_number: 1,
              agf_percent: 31,
              hp: 80,
              weight: 58,

              expertConsensus:
                consensus(70)
            },

            {
              horse_number: 2,
              agf_percent: 30,
              hp: 79,
              weight: 58,

              expertConsensus:
                consensus(69)
            }
          ]);

        const separated =
          scoreRace([
            {
              horse_number: 1,
              agf_percent: 60,
              hp: 95,
              weight: 55,

              expertConsensus:
                consensus(90)
            },

            {
              horse_number: 2,
              agf_percent: 10,
              hp: 55,
              weight: 62,

              expertConsensus:
                consensus(50)
            }
          ]);

        expect(
          raceUncertainty(close)
            .score
        ).toBeGreaterThan(
          raceUncertainty(separated)
            .score
        );
      }
    );
  }
);
