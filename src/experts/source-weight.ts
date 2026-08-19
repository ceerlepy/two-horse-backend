import type {
  ExpertPredictionRow
} from "./aggregation-types";

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function numeric(
  value: unknown,
  fallback: number
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export function effectiveSourceWeight(
  prediction: ExpertPredictionRow
): number {
  const baseWeight = clamp(
    numeric(
      prediction.base_weight,
      1
    ),
    0.10,
    1.50
  );

  const confidence = clamp(
    numeric(
      prediction.confidence,
      0.5
    ),
    0,
    1
  );

  const confidenceFactor =
    0.40 +
    (0.60 * confidence);

  const rank = Math.max(
    1,
    Math.trunc(
      numeric(
        prediction.source_rank,
        1
      )
    )
  );

  const rankFactor =
    1 /
    (
      1 +
      0.06 * (rank - 1)
    );

  return (
    baseWeight *
    confidenceFactor *
    rankFactor
  );
}
