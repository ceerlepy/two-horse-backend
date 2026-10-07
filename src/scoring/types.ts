import type {
  ExpertConsensus
} from "../experts/aggregation-types";

export interface ScoringRunner {
  horse_number: number;

  agf_percent: number | null;
  hp: number | null;
  weight: number | null;

  /*
   * Optional to preserve compatibility with
   * historical/test runner fixtures.
   */
  recent_form_raw?: string | null;

  /*
   * Computed from time-separated AGF snapshots.
   * Null means insufficient movement history.
   */
  market_score?: number | null;

  /*
   * Combined exact-condition TJK history +
   * explicit expert field commentary.
   */
  field_score?: number | null;

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
  /*
   * Final score after bounded historical learning.
   */
  score: number;

  /*
   * Win probability inside the race, from the learned AGF-anchored model.
   * Null when the race has no complete AGF and the score fell back to the
   * hand-weighted average.
   */
  winProbability?: number | null;

  /*
   * Which path produced `score`. "weighted" is the fallback.
   */
  scoreSource?: "learned" | "weighted";

  /*
   * The hand-weighted score, kept for diagnostics and comparison.
   */
  weightedScore?: number;

  /*
   * Present once the learning layer has been applied.
   */
  baseScore?: number;

  learningAdjustment?: number;

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
