import coefficients from "./data/score-coefficients.json";

/*
 * Learned model score. The hand-set 0-100 weights (SCORING_WEIGHTS) were
 * measured on 821 labelled races and came out behind the plain AGF
 * favourite: 30.4% of races won by the top pick against AGF's 34.3%. The
 * cause was the weighting, not the data -- AGF carried only 25 of 100
 * points while expert (22) and form (18) added nothing measurable on top
 * of it.
 *
 * So the score is now a conditional (within-race) logit anchored on AGF:
 *
 *   u_i = anchorCoef * log(p_agf_i) + sum_f coef_f * z_f(i)
 *   p_i = exp(u_i) / sum_j exp(u_j)
 *   z_f = clip((x - mean) / sd, -4, 4); a missing feature contributes naCoef
 *
 * Coefficients are fitted offline, never at request time. Measurement and
 * scripts: /mnt/project-files/analysis/model-puani-sinyal-testi-2026-10-07.
 */

export const LEARNED_SCORE_FEATURES = [
  /* our own component scores, re-weighted by the fit rather than by hand */
  "expert_score",
  "form_score",
  "market_score",
  "hp_score",
  "weight_score",
  "field_score",
  /* signals AGF does not fully price, read from the value model's feature store */
  "fig_best3_rel",
  "spec_best_rel",
  "idm_best400_z30_rel",
  "draw_ae_rel",
  "agf_gny_ratio",
  "jockey_ae"
] as const;

export type LearnedFeatureName =
  typeof LEARNED_SCORE_FEATURES[number];

export type LearnedFeatures =
  Partial<
    Record<
      LearnedFeatureName,
      number | null
    >
  >;

export interface LearnedFeatureCoefficient {
  name: LearnedFeatureName;
  mean: number;
  sd: number;
  coef: number;
  naCoef: number;
}

export interface LearnedScoreCoefficients {
  anchor: "lp_agf";
  anchorCoef: number;
  features: LearnedFeatureCoefficient[];
  races?: number;
  _meta: {
    version: string;
    trainedFrom?: string;
    trainedTo?: string;
    races?: number;
  };
}

export const SHIPPED_SCORE_COEFFICIENTS =
  coefficients as unknown as LearnedScoreCoefficients;

/*
 * AGF is the anchor, so the whole race needs it. One runner without a
 * published AGF share means the learned score is unavailable and the
 * caller keeps the weighted score.
 */
export function canScoreLearned(
  agfPercent:
    Array<number | null | undefined>
): boolean {
  return (
    agfPercent.length > 1 &&
    agfPercent.every(
      value =>
        value != null &&
        Number.isFinite(value) &&
        value > 0
    )
  );
}

export function learnedWinProbabilities(
  agfPercent:
    Array<number | null | undefined>,
  features: LearnedFeatures[],
  model:
    LearnedScoreCoefficients =
      SHIPPED_SCORE_COEFFICIENTS
): number[] | null {
  if (!canScoreLearned(agfPercent)) {
    return null;
  }

  const agfTotal =
    agfPercent.reduce<number>(
      (sum, value) =>
        sum + (value as number),
      0
    );

  if (!(agfTotal > 0)) {
    return null;
  }

  const utilities =
    agfPercent.map(
      (value, index) => {
        const share =
          (value as number) /
          agfTotal;

        let utility =
          model.anchorCoef *
          Math.log(
            Math.max(share, 1e-6)
          );

        for (const feature of model.features) {
          const raw =
            features[index]?.[
              feature.name
            ];

          if (
            raw == null ||
            !Number.isFinite(raw)
          ) {
            utility += feature.naCoef;
            continue;
          }

          const z =
            (raw - feature.mean) /
            (feature.sd || 1);

          utility +=
            feature.coef *
            Math.max(
              -4,
              Math.min(4, z)
            );
        }

        return utility;
      }
    );

  const max =
    Math.max(...utilities);

  const exponentials =
    utilities.map(
      utility =>
        Math.exp(utility - max)
    );

  const total =
    exponentials.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (!(total > 0)) {
    return null;
  }

  return exponentials.map(
    value => value / total
  );
}

/*
 * The app shows a 0-100 "Model puanı", so the probability is mapped onto
 * that scale against the field: 50 means exactly the average chance in
 * this race, above 50 better than average. Clamped to 1..99 so no horse
 * reads as a certainty or as impossible.
 */
export function displayScore(
  probability: number,
  fieldSize: number
): number {
  if (
    !Number.isFinite(probability) ||
    probability <= 0 ||
    fieldSize < 1
  ) {
    return 1;
  }

  const relative =
    probability * fieldSize;

  const score =
    100 *
    (
      relative /
      (1 + relative)
    );

  return Math.max(
    1,
    Math.min(
      99,
      Math.round(score * 100) / 100
    )
  );
}
