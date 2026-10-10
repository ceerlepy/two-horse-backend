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

/* 50 + (score - 50) x data completeness, completeness clamped to 0..1. */
export function shrinkTowardMiddle(
  score: number,
  completeness: number
): number {
  const weight =
    Number.isFinite(completeness)
      ? Math.min(1, Math.max(0, completeness))
      : 0;

  return Math.round((50 + (score - 50) * weight) * 100) / 100;
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
      ),

      undefined,

      runners.map(
        runner =>
          runner.expertConsensus
            ?.primaryCount
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

            /*
             * No AGF yet (overnight until race morning): the weighted
             * score is built from whatever parts exist, so a horse with
             * only expert picks could read 100. Pull it toward the
             * race-average 50 by how much of the score is populated.
             */
            score:
              shrinkTowardMiddle(
                modelScore.score,
                modelScore.confidence
              ),

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
      topProbability: null,
      probabilityGap: null,
      driver: "margin",
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

  const leaderProbability =
    ordered[0]
      .modelScore
      .winProbability ??
    null;

  const secondProbability =
    ordered[1]
      ?.modelScore
      .winProbability ??
    null;

  /*
   * How far clear the favourite is. In
   * probability where the model gives us
   * one, because the 0-100 score is a
   * squashed view of it: on 7 October the
   * same nine-point score margin covered
   * both a 37% favourite well clear of the
   * field and an 18% one in a wide-open
   * race. Twenty points of probability is
   * a horse that is genuinely clear.
   */
  const probabilityGap =
    leaderProbability === null
      ? null
      : secondProbability === null
        ? leaderProbability
        : leaderProbability -
          secondProbability;

  const marginUncertainty =
    probabilityGap === null
      ? clamp(
          1 - margin / 25,
          0,
          1
        )
      : clamp(
          1 -
          probabilityGap / 0.20,
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

    topProbability:
      leaderProbability === null
        ? null
        : round(
            leaderProbability,
            4
          ),

    probabilityGap:
      probabilityGap === null
        ? null
        : round(
            probabilityGap,
            4
          ),

    driver:
      marginUncertainty >=
      missingDataPressure
        ? "margin"
        : "data",

    expansionPressure:
      round(
        uncertainty,
        3
      )
  };
}
