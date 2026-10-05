import shipped from "./data/coefficients.json";
import type { FeatureName, FeatureVector } from "./features";

/*
 * Conditional (within-race) logit anchored on a market probability:
 *   u_i = anchorCoef * log(p_market_i) + sum_f coef_f * z_f(i) + naCoef_f * [f missing]
 *   p_i = exp(u_i) / sum_j exp(u_j)
 * z_f = clip((x - mean) / sd, -4, 4), 0 when missing.
 *
 * Variants, picked by what the market shows at the time:
 *   full   - ganyan odds + AGF (+ the AGF/ganyan disagreement feature)
 *   ganyan - ganyan odds only (races outside the altılı)
 *   agf    - AGF only (morning, before the win pool has real odds)
 */

export type Variant = "full" | "ganyan" | "agf";

export interface FeatureCoefficient {
  name: FeatureName;
  mean: number;
  sd: number;
  coef: number;
  naCoef: number;
}

export interface VariantCoefficients {
  anchor: "lp_gny" | "lp_agf";
  anchorCoef: number;
  features: FeatureCoefficient[];
  races?: number;
}

export type Coefficients = Record<Variant, VariantCoefficients> & {
  _meta: { version: string; trainedFrom?: string; trainedTo?: string };
};

export const SHIPPED_COEFFICIENTS = shipped as unknown as Coefficients;

export function chooseVariant(
  pAgf: Array<number | null>,
  pGanyan: Array<number | null>
): Variant | null {
  const hasAgf = pAgf.length > 0 && pAgf.every(p => p != null && p > 0);
  const hasOdds = pGanyan.length > 0 && pGanyan.every(p => p != null && p > 0);
  if (hasOdds) return hasAgf ? "full" : "ganyan";
  return hasAgf ? "agf" : null;
}

export function scoreRace(
  coefficients: Coefficients,
  variant: Variant,
  features: FeatureVector[],
  pAgf: Array<number | null>,
  pGanyan: Array<number | null>
): number[] {
  const c = coefficients[variant];
  const anchor = c.anchor === "lp_agf" ? pAgf : pGanyan;
  const utilities = features.map((f, i) => {
    const p = anchor[i] as number;
    let u = c.anchorCoef * Math.log(c.anchor === "lp_agf" ? Math.max(p, 1e-4) : p);
    for (const k of c.features) {
      const x = f[k.name];
      if (x == null || !Number.isFinite(x)) {
        u += k.naCoef;
      } else {
        u += k.coef * Math.max(-4, Math.min(4, (x - k.mean) / (k.sd || 1)));
      }
    }
    return u;
  });
  const max = Math.max(...utilities);
  const exps = utilities.map(u => Math.exp(u - max));
  const total = exps.reduce((s, e) => s + e, 0);
  return exps.map(e => e / total);
}
