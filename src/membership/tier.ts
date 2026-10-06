export type MembershipTier =
  "free" | "gold" | "premium";

export type TierSource =
  "trial" | "play_subscription" | "manual";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string | null;
  googleSub: string | null;
  passwordHash: string | null;
  emailVerified: boolean;
  tier: MembershipTier;
  tierSource: TierSource;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscriptionProductId: string | null;
  subscriptionExpiresAt: string | null;
  subscriptionAutoRenew: boolean | null;
  subscriptionPendingProductId: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export const TRIAL_DAYS = 7;

/*
 * The tier a new account gets for its free trial week. Premium, so a
 * new user sees the full product (the value-model label, unlimited
 * coupons, coupon history) before choosing Gold or Premium.
 */
export const TRIAL_TIER: MembershipTier = "premium";

/*
 * Play Console subscription product IDs -> the tier they grant.
 * These exact strings must match the subscription products
 * created in Play Console; see the membership setup notes.
 */
export const PRODUCT_TIER_MAP: Record<
  string,
  MembershipTier
> = {
  gold_monthly: "gold",
  premium_monthly: "premium"
};

/*
 * A stored tier can be stale -- a trial or a subscription can
 * have quietly expired since the row was last written, and
 * nothing demotes it in the background. Every read recomputes
 * the tier that is actually in effect right now instead of
 * trusting the stored column, so a stale row never grants more
 * than it should.
 */
export function effectiveTier(
  user: UserRecord,
  now: Date = new Date()
): MembershipTier {
  if (user.tierSource === "manual") {
    return user.tier;
  }

  const expiresAt =
    user.tierSource === "trial"
      ? user.trialEndsAt
      : user.subscriptionExpiresAt;

  if (!expiresAt) {
    return "free";
  }

  const expiresAtMs =
    Date.parse(
      expiresAt
    );

  if (!Number.isFinite(expiresAtMs)) {
    return "free";
  }

  return expiresAtMs > now.getTime()
    ? user.tier
    : "free";
}

export interface TierLimits {
  canGenerateCoupons: boolean;
  maxCouponBudgetTl: number;
  /*
   * Distinct coupon requests (city + pool + window + budget) a
   * user may make per Turkey calendar day. Repeating a request
   * already made that day is free, so re-opening a coupon never
   * burns the allowance.
   */
  maxCouponRequestsPerDay: number;
  canViewCouponHistory: boolean;
  /*
   * Race and training videos are links to TJK's own public pages
   * (the app opens tjk.org in the browser; nothing is re-hosted).
   * They are open to every tier on purpose: charging for access to
   * someone else's free content is the weak spot legally, so it is
   * not part of what the paid plans sell.
   */
  canViewHorseVideos: boolean;
  canViewFullSignals: boolean;
  /* The value model's "AGF underrates this horse" opinion. */
  canViewValueModel: boolean;
  /*
   * "AI'ya sor": distinct questions per Turkey calendar day.
   * Asking the same question about the same race again is free.
   */
  askAiPerDay: number;
}

export const TIER_LIMITS: Record<
  MembershipTier,
  TierLimits
> = {
  free: {
    canGenerateCoupons: false,
    maxCouponBudgetTl: 0,
    maxCouponRequestsPerDay: 0,
    canViewCouponHistory: false,
    canViewHorseVideos: true,
    canViewFullSignals: false,
    canViewValueModel: false,
    askAiPerDay: 0
  },

  gold: {
    canGenerateCoupons: true,
    maxCouponBudgetTl: 1500,
    maxCouponRequestsPerDay: 10,
    canViewCouponHistory: false,
    canViewHorseVideos: true,
    canViewFullSignals: true,
    canViewValueModel: false,
    askAiPerDay: 0
  },

  premium: {
    canGenerateCoupons: true,
    maxCouponBudgetTl: Infinity,
    maxCouponRequestsPerDay: Infinity,
    canViewCouponHistory: true,
    canViewHorseVideos: true,
    canViewFullSignals: true,
    canViewValueModel: true,
    askAiPerDay: 20
  }
};

const RUNNER_PREMIUM_SIGNAL_KEYS =
  [
    "modelScore",
    "shadowModelScore",
    "marketMovement",
    "market_score",
    "fieldSignal",
    "field_score",
    "expertConsensus",
    "valueModel",
    /* Tomorrow's card: early expert pick count + consensus sentence. */
    "expertPickCount",
    "expertSummary"
  ] as const;

const RACE_PREMIUM_SIGNAL_KEYS =
  [
    "uncertainty",
    "couponStrategy",
    "valueModelStatus",
    "expertSourceCount"
  ] as const;

export function stripPremiumRunnerSignals(
  runner: any
): any {
  const copy = {
    ...runner
  };

  for (
    const key of
      RUNNER_PREMIUM_SIGNAL_KEYS
  ) {
    delete copy[key];
  }

  return copy;
}

export function stripPremiumRaceSignals(
  race: any
): any {
  const copy = {
    ...race
  };

  for (
    const key of
      RACE_PREMIUM_SIGNAL_KEYS
  ) {
    delete copy[key];
  }

  return copy;
}

const RUNNER_VALUE_MODEL_KEYS =
  [
    "valueModel"
  ] as const;

const RACE_VALUE_MODEL_KEYS =
  [
    "valueModelStatus"
  ] as const;

/* Premium-only: drops the value model opinion for Gold callers. */
export function stripValueModelRunner(
  runner: any
): any {
  const copy = {
    ...runner
  };

  for (
    const key of
      RUNNER_VALUE_MODEL_KEYS
  ) {
    delete copy[key];
  }

  return copy;
}

export function stripValueModelRace(
  race: any
): any {
  const copy = {
    ...race
  };

  for (
    const key of
      RACE_VALUE_MODEL_KEYS
  ) {
    delete copy[key];
  }

  return copy;
}
