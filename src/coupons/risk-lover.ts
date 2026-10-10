import type {
  Env
} from "../env";

import {
  loadTodayValues,
  valueSurpriseNumber,
  type RunnerValue
} from "../value-model/service";

import type {
  CouponLegInput
} from "./optimizer";

/*
 * "Risk sever" coupon: same price tiers as our normal coupons, built
 * on the value model's chances instead of the model score, with the
 * value-model surprise forced into the RISK_LOVER_SURPRISE_LEGS legs
 * whose surprise is strongest. Normal coupons, cards and model scores
 * are untouched; the value model only enters this extra coupon.
 *
 * Backtest (579 past altılı, value model walk-forward, 2025-10..2026-10;
 * /mnt/project-files/analysis/kupon-surpriz-testi-2026-10-10): 6/6 hits
 * stayed level with our coupon (500 TL 70 -> 65, 1000 TL 97 -> 102,
 * 1500 TL 123 -> 125) while the estimated payout rose (1000 TL -29% ->
 * +22%; -44% -> -28% without the three biggest payouts). Payouts were
 * estimated from AGF and the gain is not statistically proven.
 * 2000 TL: 134 -> 136 hits, -26% -> -1%; 3000 TL: 170 -> 162 hits,
 * -12% -> -18%. So the coupon is only offered for tiers in
 * RISK_LOVER_BUDGET_RANGE_TL, at most RISK_LOVER_MAX_COUPONS of them.
 */
export const RISK_LOVER_SURPRISE_LEGS = 2;

export const RISK_LOVER_BUDGET_RANGE_TL = {
  min: 1000,
  max: 2000
} as const;

export const RISK_LOVER_MAX_COUPONS = 2;

/*
 * Keeps the highest RISK_LOVER_MAX_COUPONS tiers whose budget falls in
 * RISK_LOVER_BUDGET_RANGE_TL, in their original (ascending) order.
 */
export function riskLoverTiers<T extends { targetBudgetTl: number }>(
  coupons: T[]
): T[] {
  return coupons
    .filter(
      coupon =>
        coupon.targetBudgetTl >= RISK_LOVER_BUDGET_RANGE_TL.min &&
        coupon.targetBudgetTl <= RISK_LOVER_BUDGET_RANGE_TL.max
    )
    .slice(-RISK_LOVER_MAX_COUPONS);
}

export async function riskLoverLegs(
  env: Env,
  raceDate: string,
  city: string,
  races: any[],
  legs: CouponLegInput[]
): Promise<CouponLegInput[] | null> {
  const values =
    await loadTodayValues(env, raceDate)
      .catch(() => null);

  if (!values || values.status !== "active" || values.byRunner.size === 0) {
    return null;
  }

  const valueOf = (raceNumber: number, horseNumber: number): RunnerValue | undefined =>
    values.byRunner.get(`${city}|${raceNumber}|${horseNumber}`);

  const surprises =
    legs.map((leg, index) => {
      const race = races[index];
      const runners = (race?.runners ?? []).map((runner: any) => ({
        ...runner,
        valueModel: valueOf(leg.raceNumber, Number(runner.horse_number))
      }));
      const number = valueSurpriseNumber(runners);
      const probability = number == null ? 0 : valueOf(leg.raceNumber, number)?.probability ?? 0;
      return { index, number, probability };
    });

  const forced =
    new Map(
      surprises
        .filter(item => item.number != null)
        .sort((a, b) => b.probability - a.probability)
        .slice(0, RISK_LOVER_SURPRISE_LEGS)
        .map(item => [item.index, item.number as number])
    );

  if (forced.size === 0) {
    return null;
  }

  return legs.map((leg, index) => {
    const probabilities =
      leg.runners.map(runner => valueOf(leg.raceNumber, runner.horseNumber)?.probability);

    const complete =
      probabilities.every(p => p != null && Number.isFinite(p) && (p as number) > 0);

    return {
      ...leg,

      /* A leg the value model has not fully priced keeps the model score. */
      runners: complete
        ? leg.runners.map((runner, i) => ({ ...runner, winProbability: probabilities[i] as number }))
        : leg.runners,

      forcedHorseNumber: forced.get(index) ?? null
    };
  });
}
