import type {
  ExpertConsensus
} from "../experts/aggregation-types";

export interface ScoringRunner {
  horse_number: number;

  agf_percent: number | null;
  hp: number | null;
  weight: number | null;

  expertConsensus:
    ExpertConsensus;
}

export interface ScoreComponent {
  key:
    | "agf"
    | "expert"
    | "form"
    | "hp"
    | "market"
    | "weight"
    | "field";

  score: number | null;
  configuredWeight: number;
  effectiveWeight: number;
}

export interface HorseModelScore {
  score: number;

  /*
   * Confidence in the score itself, not
   * probability that the horse will win.
   */
  confidence: number;

  components:
    ScoreComponent[];

  availableWeight: number;
  configuredWeight: number;
}

export interface ScoredRunner<T> {
  runner: T;
  modelScore:
    HorseModelScore;
}

export interface RaceUncertainty {
  level:
    | "low"
    | "medium"
    | "high"
    | "very-high";

  score: number;

  topMargin: number;
  leaderScore: number;
  secondScore: number | null;

  /*
   * Suggested breadth pressure for the
   * future coupon optimizer.
   */
  expansionPressure:
    number;
}
