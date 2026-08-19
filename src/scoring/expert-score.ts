import type {
  ExpertConsensus
} from "../experts/aggregation-types";

import {
  clamp
} from "./math";

/*
 * Expert score is already normalized 0..100.
 *
 * When source coverage is thin, shrink it
 * toward neutral (50) instead of trusting
 * one extraction as if it were consensus.
 */
export function scoreExpert(
  consensus:
    ExpertConsensus
): number | null {
  if (
    !consensus ||
    consensus.sourceCount <= 0
  ) {
    return null;
  }

  const raw =
    clamp(
      consensus.expertScore,
      0,
      100
    );

  const confidence =
    clamp(
      consensus.supportConfidence,
      0,
      1
    );

  return (
    50 +
    (
      raw - 50
    ) * confidence
  );
}
