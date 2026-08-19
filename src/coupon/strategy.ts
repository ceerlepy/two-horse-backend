import type {
  HorseModelScore,
  RaceUncertainty
} from "../scoring/types";


export type CouponMode =
  | "single"
  | "compact"
  | "spread";


export interface CouponStrategy {
  mode: CouponMode;

  horseNumbers: number[];

  confidence: number;

  expansionPressure: number;

  reason: string;
}


export function recommendCouponStrategy<
  T extends {
    horse_number: number;

    modelScore:
      HorseModelScore;
  }
>(
  runners: T[],
  uncertainty:
    RaceUncertainty
): CouponStrategy {
  const ordered =
    [...runners]
      .sort(
        (a, b) =>
          b.modelScore.score -
          a.modelScore.score
      );

  if (!ordered.length) {
    return {
      mode: "spread",
      horseNumbers: [],
      confidence: 0,
      expansionPressure: 1,
      reason:
        "no-runners"
    };
  }

  const averageConfidence =
    ordered.reduce(
      (sum, runner) =>
        sum +
        runner
          .modelScore
          .confidence,
      0
    ) /
    ordered.length;

  const topMargin =
    uncertainty.topMargin;

  /*
   * SINGLE
   *
   * Require all three:
   * - low race uncertainty
   * - high populated-model confidence
   * - meaningful leader margin
   */
  if (
    uncertainty.level ===
      "low" &&
    averageConfidence >=
      0.75 &&
    topMargin >= 8
  ) {
    return {
      mode: "single",

      horseNumbers: [
        ordered[0]
          .horse_number
      ],

      confidence:
        Number(
          averageConfidence
            .toFixed(3)
        ),

      expansionPressure:
        uncertainty
          .expansionPressure,

      reason:
        "clear-leader"
    };
  }

  /*
   * COMPACT
   *
   * A reasonably supported race,
   * but not safe enough to single.
   */
  if (
    (
      uncertainty.level ===
        "low" ||
      uncertainty.level ===
        "medium"
    ) &&
    averageConfidence >=
      0.60 &&
    topMargin >= 3
  ) {
    const count =
      uncertainty
        .expansionPressure <
      0.40
        ? 2
        : 3;

    return {
      mode: "compact",

      horseNumbers:
        ordered
          .slice(
            0,
            Math.min(
              count,
              ordered.length
            )
          )
          .map(
            runner =>
              runner.horse_number
          ),

      confidence:
        Number(
          averageConfidence
            .toFixed(3)
        ),

      expansionPressure:
        uncertainty
          .expansionPressure,

      reason:
        "competitive-top-group"
    };
  }

  /*
   * SPREAD
   *
   * No arbitrary max-horse ceiling.
   *
   * This is only the race-level candidate
   * ranking. Final expansion is controlled
   * by the six-leg budget optimizer.
   */
  const pressure =
    Math.max(
      0,
      Math.min(
        1,
        uncertainty
          .expansionPressure
      )
    );

  const desiredCount =
    Math.max(
      3,
      Math.ceil(
        ordered.length *
        Math.max(
          0.35,
          pressure
        )
      )
    );

  const spreadCount =
    Math.min(
      ordered.length,
      desiredCount
    );

  return {
    mode: "spread",

    horseNumbers:
      ordered
        .slice(
          0,
          spreadCount
        )
        .map(
          runner =>
            runner.horse_number
        ),

    confidence:
      Number(
        averageConfidence
          .toFixed(3)
      ),

    expansionPressure:
      uncertainty
        .expansionPressure,

    reason:
      "race-uncertainty"
  };
}
