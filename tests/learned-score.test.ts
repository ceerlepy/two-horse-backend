import {
  describe,
  expect,
  it
} from "vitest";

import {
  scoreRace
} from "../src/scoring/race-score";

import {
  SHIPPED_SCORE_COEFFICIENTS,
  EXPERT_PRIMARY_PICK_COEF,
  displayScore,
  learnedWinProbabilities
} from "../src/scoring/learned-score";

function consensus(
  expertScore: number | null = null
) {
  return {
    sourceCount: 0,

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
    supportConfidence: 0,

    labels: []
  };
}

function runner(
  horseNumber: number,
  agf: number | null
) {
  return {
    horse_number: horseNumber,
    agf_percent: agf,
    hp: 50,
    weight: 56,

    expertConsensus:
      consensus()
  };
}

describe(
  "learned model score",
  () => {
    it(
      "never ships a coefficient that could rank a horse above a stronger AGF for free",
      () => {
        /*
         * Every feature is defined so higher = better. A negative
         * coefficient only appears through collinearity with AGF and lets
         * a 45% AGF horse fall behind a 15% one, so the fit is bounded at
         * zero and the shipped file must respect that.
         */
        expect(
          SHIPPED_SCORE_COEFFICIENTS
            .anchorCoef
        ).toBeGreaterThan(0);

        for (const feature of SHIPPED_SCORE_COEFFICIENTS.features) {
          expect(
            feature.coef
          ).toBeGreaterThanOrEqual(0);

          expect(
            feature.sd
          ).toBeGreaterThan(0);
        }
      }
    );

    it(
      "turns AGF into a within-race distribution that sums to one",
      () => {
        const probabilities =
          learnedWinProbabilities(
            [45, 25, 15, 15],
            [{}, {}, {}, {}]
          );

        expect(
          probabilities
        ).not.toBeNull();

        const total =
          (
            probabilities as number[]
          ).reduce(
            (sum, value) =>
              sum + value,
            0
          );

        expect(
          total
        ).toBeCloseTo(1, 10);

        /*
         * Same features everywhere, so the order has to follow AGF.
         */
        expect(
          (
            probabilities as number[]
          )[0]
        ).toBeGreaterThan(
          (
            probabilities as number[]
          )[1]
        );
      }
    );

    it(
      "treats a share published as 0 as present, not missing",
      () => {
        /*
         * TJK rounds AGF to whole percents, so a long shot in a full
         * field reads 0 while the race still adds up to 100. Bailing out
         * there would drop the learned score for the whole race.
         */
        const probabilities =
          learnedWinProbabilities(
            [60, 39, 1, 0],
            [{}, {}, {}, {}]
          );

        expect(
          probabilities
        ).not.toBeNull();

        const values =
          probabilities as number[];

        expect(
          values.reduce(
            (sum, value) =>
              sum + value,
            0
          )
        ).toBeCloseTo(1, 10);

        expect(
          values[3]
        ).toBeGreaterThan(0);

        expect(
          values[3]
        ).toBeLessThan(
          values[2]
        );
      }
    );

    it(
      "falls back to the weighted score when the race has no complete AGF",
      () => {
        expect(
          learnedWinProbabilities(
            [45, null, 15],
            [{}, {}, {}]
          )
        ).toBeNull();

        expect(
          learnedWinProbabilities(
            [0, 0, 0],
            [{}, {}, {}]
          )
        ).toBeNull();

        const scored =
          scoreRace([
            runner(1, 45),
            runner(2, null)
          ]);

        expect(
          scored[0]
            .modelScore
            .scoreSource
        ).toBe("weighted");

        expect(
          scored[0]
            .modelScore
            .winProbability
        ).toBeNull();
      }
    );

    it(
      "scores the stronger AGF higher and keeps the weighted score for comparison",
      () => {
        const scored =
          scoreRace([
            runner(1, 45),
            runner(2, 10)
          ]);

        expect(
          scored[0]
            .modelScore
            .scoreSource
        ).toBe("learned");

        expect(
          scored[0]
            .modelScore
            .score
        ).toBeGreaterThan(
          scored[1]
            .modelScore
            .score
        );

        expect(
          typeof scored[0]
            .modelScore
            .weightedScore
        ).toBe("number");
      }
    );

    it(
      "reads the borrowed value-model signals and lets them move the order",
      () => {
        const base =
          scoreRace([
            runner(1, 30),
            runner(2, 30)
          ]);

        expect(
          base[0]
            .modelScore.score
        ).toBeCloseTo(
          base[1]
            .modelScore.score,
          6
        );

        const withSpec =
          scoreRace(
            [
              runner(1, 30),
              runner(2, 30)
            ],

            new Map([
              [
                1,
                {
                  spec_best_rel: 40
                }
              ]
            ])
          );

        expect(
          withSpec[0]
            .modelScore.score
        ).toBeGreaterThan(
          withSpec[1]
            .modelScore.score
        );
      }
    );

    it(
      "puts the field-average chance at 50 on the 0-100 scale",
      () => {
        expect(
          displayScore(1 / 10, 10)
        ).toBeCloseTo(50, 6);

        expect(
          displayScore(0.4, 10)
        ).toBeGreaterThan(
          displayScore(0.2, 10)
        );

        expect(
          displayScore(0, 10)
        ).toBe(1);
      }
    );
  }
);

describe(
  "coupons on learned probabilities",
  () => {
    it(
      "uses the model's own distribution instead of softmaxing the 0-100 scores",
      async () => {
        const {
          optimizeSixFoldCoupons
        } =
          await import(
            "../src/coupons/optimizer"
          );

        /*
         * Flat scores would softmax to an even 1/4 each. The model says
         * one horse owns 70% of the leg, so the single-horse coverage has
         * to read 0.70, not 0.25.
         */
        const legs =
          Array.from(
            {
              length: 6
            },

            (_, index) => ({
              raceNumber:
                index + 1,

              uncertainty: 0.5,

              runners: [
                {
                  horseNumber: 1,
                  horseName: "A",
                  score: 50,
                  confidence: 1,
                  winProbability: 0.70
                },
                {
                  horseNumber: 2,
                  horseName: "B",
                  score: 50,
                  confidence: 1,
                  winProbability: 0.10
                },
                {
                  horseNumber: 3,
                  horseName: "C",
                  score: 50,
                  confidence: 1,
                  winProbability: 0.10
                },
                {
                  horseNumber: 4,
                  horseName: "D",
                  score: 50,
                  confidence: 1,
                  winProbability: 0.10
                }
              ]
            })
          );

        const coupons =
          optimizeSixFoldCoupons({
            legs,
            budgetTl: 1,
            unitPriceTl: 1
          });

        const single =
          coupons[0];

        expect(
          single.legs[0]
            .horses.length
        ).toBe(1);

        expect(
          single.legs[0]
            .coverageProbability
        ).toBeCloseTo(0.70, 6);
      }
    );
  }
);

describe(
  "expert first-choice nudge",
  () => {
    it(
      "lifts a picked horse by a small fixed amount, capped at three picks",
      () => {
        const agf = [30, 30, 40];
        const none =
          learnedWinProbabilities(agf, [{}, {}, {}])!;
        const picked =
          learnedWinProbabilities(agf, [{}, {}, {}], undefined, [2, 0, 0])!;
        const many =
          learnedWinProbabilities(agf, [{}, {}, {}], undefined, [9, 0, 0])!;
        const three =
          learnedWinProbabilities(agf, [{}, {}, {}], undefined, [3, 0, 0])!;

        expect(none[0]).toBeCloseTo(none[1], 9);
        expect(
          Math.log(picked[0] / picked[1])
        ).toBeCloseTo(2 * EXPERT_PRIMARY_PICK_COEF, 9);
        expect(many[0]).toBeCloseTo(three[0], 9);
        /* AGF still leads: 40% stays ahead of a 30% horse with two picks */
        expect(picked[2]).toBeGreaterThan(picked[0]);
      }
    );
  }
);
