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
  tier: MembershipTier;
  tierSource: TierSource;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscriptionProductId: string | null;
  subscriptionExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export const TRIAL_DAYS = 7;

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
  canViewHorseVideos: boolean;
  canViewFullSignals: boolean;
}

export const TIER_LIMITS: Record<
  MembershipTier,
  TierLimits
> = {
  free: {
    canGenerateCoupons: false,
    maxCouponBudgetTl: 0,
    canViewHorseVideos: false,
    canViewFullSignals: false
  },

  gold: {
    canGenerateCoupons: true,
    maxCouponBudgetTl: 1500,
    canViewHorseVideos: false,
    canViewFullSignals: true
  },

  premium: {
    canGenerateCoupons: true,
    maxCouponBudgetTl: Infinity,
    canViewHorseVideos: true,
    canViewFullSignals: true
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
    "expertConsensus"
  ] as const;

const RACE_PREMIUM_SIGNAL_KEYS =
  [
    "uncertainty",
    "couponStrategy"
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
