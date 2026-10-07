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

describe(
  "race uncertainty reads the field in probability",
  () => {
    /*
     * The 0-100 score squashes: on 7 October the same nine-point score
     * margin covered a 37% favourite well clear of its race and an 18%
     * one in a wide-open race. Reading closeness off the score called
     * both "clearly ahead".
     */
    function race(
      shares: number[]
    ) {
      return scoreRace(
        shares.map(
          (agf, index) => ({
            horse_number: index + 1,
            agf_percent: agf,
            hp: 70,
            weight: 56,
            expertConsensus:
              consensus(60)
          })
        )
      );
    }

    it(
      "calls a race with a runaway favourite open when the field is in fact close",
      () => {
        const wideOpen =
          raceUncertainty(
            race([
              18, 15, 14, 13, 12,
              10, 8, 5, 3, 2
            ])
          );

        const clear =
          raceUncertainty(
            race([
              60, 12, 9, 7, 5,
              3, 2, 1, 1
            ])
          );

        expect(
          wideOpen.probabilityGap
        ).not.toBeNull();

        expect(
          wideOpen
            .probabilityGap as number
        ).toBeLessThan(
          clear
            .probabilityGap as number
        );

        expect(
          wideOpen.score
        ).toBeGreaterThan(
          clear.score
        );

        expect(
          clear.level
        ).toBe("low");
      }
    );

    it(
      "says which of the two raised the level",
      () => {
        const close =
          raceUncertainty(
            race([
              21, 20, 20, 20, 19
            ])
          );

        expect(
          close.driver
        ).toBe("margin");

        /*
         * Same clear favourite, but nothing is known beyond AGF, so
         * only thin data can be holding the level up. The app says a
         * different sentence for each, and cannot tell them apart
         * from the numbers alone.
         */
        const thin =
          raceUncertainty(
            scoreRace(
              [60, 12, 9, 7, 5, 4, 3]
                .map(
                  (agf, index) => ({
                    horse_number:
                      index + 1,
                    agf_percent: agf,
                    hp: null,
                    weight: null,
                    expertConsensus:
                      null
                  })
                )
            )
          );

        expect(
          thin.driver
        ).toBe("data");
      }
    );

    it(
      "keeps the score margin for a race that fell back to the weighted score",
      () => {
        const fallback =
          raceUncertainty(
            scoreRace([
              {
                horse_number: 1,
                agf_percent: null,
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
            ])
          );

        expect(
          fallback.probabilityGap
        ).toBeNull();

        expect(
          fallback.topProbability
        ).toBeNull();

        expect(
          fallback.topMargin
        ).toBeGreaterThan(0);
      }
    );
  }
);
