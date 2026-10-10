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
 * Expert first choices (banko / favori / yıldız) add a small, fixed
 * nudge per expert, capped at three. The bounded fit gives expert_score
 * zero weight because AGF already prices the picks; the owner asked for
 * expert opinion to count as long as it does not hurt (2026-10-10).
 * Measured on 788 races with expert coverage, AGF anchor, train before
 * 20 Sep / test after: 0.05 per pick was neutral (log-loss gain +0.0007
 * +/- 0.0014 on 348 test races, top-1 30.5% -> 30.5%, top-3 unchanged).
 * The full expert_score, which also counts rival and surprise mentions,
 * made log-loss worse at any positive weight, and expert "sürpriz"
 * horses won only 0.78x what their AGF implied, so those stay out.
 * Kept outside score-coefficients.json so the weekly refit cannot drop it.
 */
export const EXPERT_PRIMARY_PICK_COEF = 0.05;
export const EXPERT_PRIMARY_PICK_CAP = 3;

/*
 * AGF is the anchor, so the whole race needs it: one runner with no
 * published share means the learned score is unavailable and the caller
 * keeps the weighted score.
 *
 * A published 0.0 is not a missing share. TJK rounds AGF to whole
 * percents, so a genuine long shot in a full field reads 0 while the
 * race's shares still add up to 100 -- on 7 October 2026 that was 3 of
 * the day's 17 races. Those count as present and the anchor floors them,
 * exactly as the offline fit treated them.
 */
export function canScoreLearned(
  agfPercent:
    Array<number | null | undefined>
): boolean {
  if (agfPercent.length < 2) {
    return false;
  }

  let total = 0;

  for (const value of agfPercent) {
    if (
      value == null ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      return false;
    }

    total += value;
  }

  return total > 0;
}

export function learnedWinProbabilities(
  agfPercent:
    Array<number | null | undefined>,
  features: LearnedFeatures[],
  model:
    LearnedScoreCoefficients =
      SHIPPED_SCORE_COEFFICIENTS,
  expertPrimaryPicks:
    Array<number | null | undefined> = []
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

        /*
         * Floored, so a share published as 0 lands on the smallest
         * chance the model can express instead of -Infinity.
         */
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

        const picks =
          expertPrimaryPicks[index];

        if (
          picks != null &&
          Number.isFinite(picks) &&
          picks > 0
        ) {
          utility +=
            EXPERT_PRIMARY_PICK_COEF *
            Math.min(
              EXPERT_PRIMARY_PICK_CAP,
              picks
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
