import type {
  ExpertConsensus,
  ExpertPredictionRow
} from "./aggregation-types";

import {
  effectiveSourceWeight
} from "./source-weight";

import {
  expertFlag,
  strongestPositiveSignal
} from "./signal-policy";

function round(
  value: number,
  digits = 3
): number {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

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

export function aggregateExpertPredictions(
  predictions: ExpertPredictionRow[]
): ExpertConsensus {
  const bySource =
    new Map<
      string,
      ExpertPredictionRow
    >();

  for (const prediction of predictions) {
    if (!prediction.source_key) {
      continue;
    }

    if (
      !bySource.has(
        prediction.source_key
      )
    ) {
      bySource.set(
        prediction.source_key,
        prediction
      );
    }
  }

  const rows =
    [...bySource.values()];

  let bankoCount = 0;
  let favoriteCount = 0;
  let strongCount = 0;
  let starCount = 0;
  let rivalCount = 0;
  let surpriseCount = 0;
  let avoidCount = 0;

  let weightedBanko = 0;
  let weightedFavorite = 0;
  let weightedStrong = 0;
  let weightedStar = 0;
  let weightedRival = 0;
  let weightedSurprise = 0;
  let weightedAvoid = 0;

  let weightedSupport = 0;
  let weightedOpposition = 0;

  let representedWeight = 0;

  for (const prediction of rows) {
    const weight =
      effectiveSourceWeight(
        prediction
      );

    representedWeight += weight;

    const banko =
      expertFlag(
        prediction.is_banko
      );

    const favorite =
      expertFlag(
        prediction.is_favorite
      );

    const strong =
      expertFlag(
        prediction.is_strong
      );

    const star =
      expertFlag(
        prediction.is_star
      );

    const rival =
      expertFlag(
        prediction.is_rival
      );

    const surprise =
      expertFlag(
        prediction.is_surprise
      );

    const avoid =
      expertFlag(
        prediction.is_avoid
      );

    if (banko) {
      bankoCount++;
      weightedBanko += weight;
    }

    if (favorite) {
      favoriteCount++;
      weightedFavorite += weight;
    }

    if (strong) {
      strongCount++;
      weightedStrong += weight;
    }

    if (star) {
      starCount++;
      weightedStar += weight;
    }

    if (rival) {
      rivalCount++;
      weightedRival += weight;
    }

    if (surprise) {
      surpriseCount++;
      weightedSurprise += weight;
    }

    if (avoid) {
      avoidCount++;
      weightedAvoid += weight;

      weightedOpposition +=
        weight * 0.90;
    }

    /*
     * Multiple positive labels from one source
     * are correlated, therefore use only the
     * strongest signal from that source.
     */
    if (!avoid) {
      weightedSupport +=
        weight *
        strongestPositiveSignal(
          prediction
        );
    }
  }

  const denominator =
    Math.max(
      representedWeight,
      0.001
    );

  const netSupport =
    (
      weightedSupport -
      weightedOpposition
    ) /
    denominator;

  const expertScore =
    clamp(
      50 +
      50 * netSupport,
      0,
      100
    );

  const sourceCount =
    rows.length;

  const supportConfidence =
    1 -
    Math.exp(
      -sourceCount / 2.5
    );

  const labels: string[] = [];

  if (bankoCount > 0) {
    labels.push("banko");
  }

  if (favoriteCount > 0) {
    labels.push("favori");
  }

  if (strongCount > 0) {
    labels.push("güçlü");
  }

  if (starCount > 0) {
    labels.push("yıldız");
  }

  if (rivalCount > 0) {
    labels.push("rakip");
  }

  if (surpriseCount > 0) {
    labels.push("sürpriz");
  }

  if (avoidCount > 0) {
    labels.push("kaçın");
  }

  return {
    sourceCount,

    bankoCount,
    favoriteCount,
    strongCount,
    starCount,
    rivalCount,
    surpriseCount,
    avoidCount,

    weightedBanko:
      round(weightedBanko),

    weightedFavorite:
      round(weightedFavorite),

    weightedStrong:
      round(weightedStrong),

    weightedStar:
      round(weightedStar),

    weightedRival:
      round(weightedRival),

    weightedSurprise:
      round(weightedSurprise),

    weightedAvoid:
      round(weightedAvoid),

    weightedSupport:
      round(weightedSupport),

    weightedOpposition:
      round(weightedOpposition),

    expertScore:
      round(
        expertScore,
        1
      ),

    supportConfidence:
      round(
        supportConfidence,
        3
      ),

    labels
  };
}
