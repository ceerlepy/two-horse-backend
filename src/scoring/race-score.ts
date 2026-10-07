import type {
  HorseModelScore,
  RaceUncertainty,
  ScoringRunner
} from "./types";

import {
  clamp,
  round
} from "./math";

import {
  scoreHorse
} from "./horse-score";

import {
  displayScore,
  learnedWinProbabilities,
  type LearnedFeatures
} from "./learned-score";

/*
 * Signals the learned score reads from the value model's feature store,
 * keyed by horse number. Absent features are handled by the model.
 */
export type RaceLearnedFeatures =
  Map<number, LearnedFeatures>;

/*
 * The component scores the learned model consumes alongside the value
 * model features. Scores come straight from the weighted pass, so both
 * paths see exactly the same inputs.
 */
function componentFeatures(
  modelScore: HorseModelScore
): LearnedFeatures {
  const scoreOf = (
    key: string
  ): number | null =>
    modelScore.components.find(
      component =>
        component.key === key
    )?.score ?? null;

  return {
    expert_score:
      scoreOf("expert"),
    form_score:
      scoreOf("form"),
    market_score:
      scoreOf("market"),
    hp_score:
      scoreOf("hp"),
    weight_score:
      scoreOf("weight"),
    field_score:
      scoreOf("field")
  };
}

export function scoreRace<
  T extends ScoringRunner
>(
  runners: T[],
  learnedFeatures?:
    RaceLearnedFeatures | null
): Array<
  T & {
    modelScore:
      HorseModelScore
  }
> {
  const weighted =
    runners.map(
      runner =>
        scoreHorse(
          runner,
          runners
        )
    );

  const probabilities =
    learnedWinProbabilities(
      runners.map(
        runner =>
          runner.agf_percent
      ),

      weighted.map(
        (modelScore, index) => ({
          ...componentFeatures(
            modelScore
          ),

          ...(
            learnedFeatures?.get(
              runners[index]
                .horse_number
            ) ?? {}
          )
        })
      )
    );

  return runners.map(
    (runner, index) => {
      const modelScore =
        weighted[index];

      if (!probabilities) {
        return {
          ...runner,

          modelScore: {
            ...modelScore,
            winProbability: null,
            scoreSource:
              "weighted" as const,
            weightedScore:
              modelScore.score
          }
        };
      }

      const probability =
        probabilities[index];

      return {
        ...runner,

        modelScore: {
          ...modelScore,

          score:
            displayScore(
              probability,
              runners.length
            ),

          winProbability:
            probability,

          scoreSource:
            "learned" as const,

          weightedScore:
            modelScore.score
        }
      };
    }
  );
}

export function raceUncertainty<
  T extends {
    modelScore:
      HorseModelScore;
  }
>(
  runners: T[]
): RaceUncertainty {
  const ordered =
    [...runners].sort(
      (a, b) =>
        b.modelScore.score -
        a.modelScore.score
    );

  if (!ordered.length) {
    return {
      level: "very-high",
      score: 100,
      topMargin: 0,
      leaderScore: 0,
      secondScore: null,
      expansionPressure: 1
    };
  }

  const leader =
    ordered[0]
      .modelScore.score;

  const second =
    ordered[1]
      ?.modelScore.score ??
    null;

  const margin =
    second === null
      ? leader
      : leader - second;

  /*
   * Small top-2 margin -> uncertain.
   */
  const marginUncertainty =
    clamp(
      1 - margin / 25,
      0,
      1
    );

  const averageConfidence =
    ordered.reduce(
      (sum, item) =>
        sum +
        item.modelScore.confidence,
      0
    ) /
    ordered.length;

  const missingDataPressure =
    1 -
    clamp(
      averageConfidence,
      0,
      1
    );

  /*
   * Race uncertainty is driven primarily
   * by competitive closeness, secondarily
   * by missing model inputs.
   */
  const uncertainty =
    clamp(
      (
        0.70 *
        marginUncertainty
      ) +
      (
        0.30 *
        missingDataPressure
      ),
      0,
      1
    );

  let level:
    RaceUncertainty["level"];

  if (uncertainty < 0.25) {
    level = "low";
  } else if (
    uncertainty < 0.50
  ) {
    level = "medium";
  } else if (
    uncertainty < 0.75
  ) {
    level = "high";
  } else {
    level = "very-high";
  }

  return {
    level,

    score:
      round(
        uncertainty * 100,
        1
      ),

    topMargin:
      round(
        margin,
        2
      ),

    leaderScore:
      round(
        leader,
        2
      ),

    secondScore:
      second === null
        ? null
        : round(
            second,
            2
          ),

    expansionPressure:
      round(
        uncertainty,
        3
      )
  };
}
