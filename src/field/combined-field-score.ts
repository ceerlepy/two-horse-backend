import {
  clamp,
  round
} from "../scoring/math";

export interface CombinedFieldScore {
  score: number | null;

  tjkScore: number | null;
  expertScore: number | null;
}

export function combineFieldScores(
  tjkScore:
    number | null,
  expertScore:
    number | null
): CombinedFieldScore {
  if (
    tjkScore === null &&
    expertScore === null
  ) {
    return {
      score: null,
      tjkScore,
      expertScore
    };
  }

  if (
    tjkScore !== null &&
    expertScore !== null
  ) {
    /*
     * Objective exact-condition TJK history dominates.
     * Expert explicit field commentary supplements it.
     */
    return {
      score:
        round(
          clamp(
            tjkScore *
              0.75 +
            expertScore *
              0.25,
            0,
            100
          ),
          1
        ),

      tjkScore,
      expertScore
    };
  }

  return {
    score:
      tjkScore ??
      expertScore,

    tjkScore,
    expertScore
  };
}
