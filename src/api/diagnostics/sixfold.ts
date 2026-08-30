/*
 * "Pending" alone can't tell an operator whether the evaluation
 * pipeline is broken or a snapshot is just waiting on a result that
 * hasn't arrived yet. overdueUnclassified is the actual health
 * signal: a pending row old enough that evaluatePendingSixFoldCoupons
 * should already have marked it RESULTS_UNAVAILABLE (see
 * SIXFOLD_STALE_AFTER_DAYS in ../../coupons/repository) but hasn't --
 * meaning the cron isn't running, not that results are merely slow.
 */
export interface SixFoldCouponHealth {
  total: number;
  evaluated: number;
  pending: number;
  unresolved: number;
  overdueUnclassified: number;
  ok: boolean;
}

export function buildSixFoldCouponHealth(row: {
  total: unknown;
  evaluated: unknown;
  pending: unknown;
  unresolved: unknown;
  overdue_unclassified: unknown;
}): SixFoldCouponHealth {
  const overdueUnclassified =
    Number(row.overdue_unclassified ?? 0);

  return {
    total: Number(row.total ?? 0),
    evaluated: Number(row.evaluated ?? 0),
    pending: Number(row.pending ?? 0),
    unresolved: Number(row.unresolved ?? 0),
    overdueUnclassified,

    ok: overdueUnclassified === 0
  };
}
