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

export function strongestPositiveSignal(
  prediction: ExpertPredictionRow
): number {
  if (expertFlag(prediction.is_banko)) {
    return 1.00;
  }

  if (expertFlag(prediction.is_favorite)) {
    return 0.86;
  }

  if (expertFlag(prediction.is_strong)) {
    return 0.74;
  }

  if (expertFlag(prediction.is_star)) {
    return 0.68;
  }

  if (expertFlag(prediction.is_rival)) {
    return 0.46;
  }

  if (expertFlag(prediction.is_surprise)) {
    return 0.30;
  }

  return 0;
}
