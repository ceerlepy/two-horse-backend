import type {
  ExpertPredictionRow
} from "./aggregation-types";

export function expertFlag(
  value: unknown
): boolean {
  return (
    value === true ||
    value === 1 ||
    value === "1"
  );
}

/*
 * Category strength, strongest first -- the first flag present on a
 * prediction wins. Values are relative weights (banko is the
 * strongest positive signal a source can give, surprise the
 * weakest), consumed wherever a single positive-signal number is
 * needed for a prediction.
 */
export const EXPERT_SIGNAL_STRENGTH_WEIGHTS: Array<{
  flag: keyof ExpertPredictionRow;
  weight: number;
}> = [
  { flag: "is_banko", weight: 1.00 },
  { flag: "is_favorite", weight: 0.86 },
  { flag: "is_strong", weight: 0.74 },
  { flag: "is_star", weight: 0.68 },
  { flag: "is_rival", weight: 0.46 },
  { flag: "is_surprise", weight: 0.30 }
];

export function strongestPositiveSignal(
  prediction: ExpertPredictionRow
): number {
  const match =
    EXPERT_SIGNAL_STRENGTH_WEIGHTS.find(
      candidate =>
        expertFlag(
          prediction[candidate.flag]
        )
    );

  return match?.weight ?? 0;
}
