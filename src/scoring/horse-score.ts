import type {
  HorseModelScore,
  ScoreComponent,
  ScoringRunner
} from "./types";

import {
  SCORING_WEIGHTS,
  TOTAL_SCORING_WEIGHT
} from "./weights";

import {
  round
} from "./math";

import {
  scoreAgf
} from "./agf-score";

import {
  scoreHp
} from "./hp-score";

import {
  scoreWeight
} from "./weight-score";

import {
  scoreExpert
} from "./expert-score";

import {
  scoreRecentForm
} from "../form/recent-form-score";

export function scoreHorse(
  runner: ScoringRunner,
  raceRunners:
    ScoringRunner[]
): HorseModelScore {
  const raw = [
    {
      key: "agf" as const,
      score:
        scoreAgf(
          runner.agf_percent
        ),
      configuredWeight:
        SCORING_WEIGHTS.agf
    },

    {
      key: "expert" as const,
      score:
        scoreExpert(
          runner.expertConsensus
        ),
      configuredWeight:
        SCORING_WEIGHTS.expert
    },

    {
      key: "form" as const,

      score:
        scoreRecentForm(
          runner.recent_form_raw
        ),

      configuredWeight:
        SCORING_WEIGHTS.form
    },

    {
      key: "hp" as const,
      score:
        scoreHp(
          runner.hp,
          raceRunners.map(
            x => x.hp
          )
        ),
      configuredWeight:
        SCORING_WEIGHTS.hp
    },

    {
      key: "market" as const,

      score:
        runner.market_score ??
        null,

      configuredWeight:
        SCORING_WEIGHTS.market
    },

    {
      key: "weight" as const,
      score:
        scoreWeight(
          runner.weight,
          raceRunners.map(
            x => x.weight
          )
        ),
      configuredWeight:
        SCORING_WEIGHTS.weight
    },

    {
      key: "field" as const,
      score: null,
      configuredWeight:
        SCORING_WEIGHTS.field
    }
  ];

  const available =
    raw.filter(
      item =>
        item.score !== null
    );

  const availableWeight =
    available.reduce(
      (sum, item) =>
        sum +
        item.configuredWeight,
      0
    );

  if (availableWeight <= 0) {
    return {
      score: 50,
      confidence: 0,
      components:
        raw.map(
          item => ({
            ...item,
            effectiveWeight: 0
          })
        ),
      availableWeight: 0,
      configuredWeight:
        TOTAL_SCORING_WEIGHT
    };
  }

  let weightedTotal = 0;

  const components:
    ScoreComponent[] =
    raw.map(item => {
      if (item.score === null) {
        return {
          ...item,
          effectiveWeight: 0
        };
      }

      const effectiveWeight =
        (
          item.configuredWeight /
          availableWeight
        ) * 100;

      weightedTotal +=
        item.score *
        effectiveWeight;

      return {
        ...item,
        effectiveWeight:
          round(
            effectiveWeight,
            2
          )
      };
    });

  const score =
    weightedTotal / 100;

  /*
   * Confidence reflects how much of the
   * configured model is actually populated.
   *
   * Expert source breadth is already handled
   * inside scoreExpert.
   */
  const confidence =
    availableWeight /
    TOTAL_SCORING_WEIGHT;

  return {
    score:
      round(score, 2),

    confidence:
      round(confidence, 3),

    components,

    availableWeight,

    configuredWeight:
      TOTAL_SCORING_WEIGHT
  };
}
