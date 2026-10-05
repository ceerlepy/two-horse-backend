import {
  describe,
  expect,
  it
} from "vitest";

import {
  effectiveTier,
  TIER_LIMITS,
  PRODUCT_TIER_MAP,
  stripPremiumRunnerSignals,
  stripPremiumRaceSignals,
  type UserRecord
} from "../src/membership/tier";

function baseUser(
  overrides: Partial<UserRecord>
): UserRecord {
  return {
    id: "u1",
    email: "test@example.com",
    displayName: null,
    googleSub: null,
    passwordHash: null,
    emailVerified: true,
    tier: "free",
    tierSource: "trial",
    trialStartedAt: null,
    trialEndsAt: null,
    subscriptionProductId: null,
    subscriptionExpiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    ...overrides
  };
}

const NOW =
  new Date(
    "2026-08-31T12:00:00.000Z"
  );

describe(
  "effectiveTier",
  () => {
    it(
      "a manual grant never expires",
      () => {
        const user =
          baseUser({
            tier: "premium",
            tierSource: "manual"
          });

        expect(
          effectiveTier(
            user,
            NOW
          )
        ).toBe(
          "premium"
        );
      }
    );

    it(
      "an active trial keeps its granted tier",
      () => {
        const user =
          baseUser({
            tier: "premium",
            tierSource: "trial",
            trialEndsAt:
              "2026-09-01T00:00:00.000Z"
          });

        expect(
          effectiveTier(
            user,
            NOW
          )
        ).toBe(
          "premium"
        );
      }
    );

    it(
      "an expired trial downgrades to free even though the stored tier is stale",
      () => {
        const user =
          baseUser({
            tier: "premium",
            tierSource: "trial",
            trialEndsAt:
              "2026-08-01T00:00:00.000Z"
          });

        expect(
          effectiveTier(
            user,
            NOW
          )
        ).toBe(
          "free"
        );
      }
    );

    it(
      "an active Play subscription keeps its granted tier",
      () => {
        const user =
          baseUser({
            tier: "gold",
            tierSource: "play_subscription",
            subscriptionExpiresAt:
              "2026-09-15T00:00:00.000Z"
          });

        expect(
          effectiveTier(
            user,
            NOW
          )
        ).toBe(
          "gold"
        );
      }
    );

    it(
      "an expired Play subscription downgrades to free",
      () => {
        const user =
          baseUser({
            tier: "gold",
            tierSource: "play_subscription",
            subscriptionExpiresAt:
              "2026-07-01T00:00:00.000Z"
          });

        expect(
          effectiveTier(
            user,
            NOW
          )
        ).toBe(
          "free"
        );
      }
    );

    it(
      "a trial/subscription with no expiry stored defaults to free",
      () => {
        const user =
          baseUser({
            tier: "premium",
            tierSource: "trial",
            trialEndsAt: null
          });

        expect(
          effectiveTier(
            user,
            NOW
          )
        ).toBe(
          "free"
        );
      }
    );
  }
);

describe(
  "TIER_LIMITS",
  () => {
    it(
      "free cannot generate coupons but can open TJK videos",
      () => {
        expect(
          TIER_LIMITS.free
            .canGenerateCoupons
        ).toBe(false);

        expect(
          TIER_LIMITS.free
            .canViewHorseVideos
        ).toBe(true);
      }
    );

    it(
      "gold is capped below premium's unlimited budget",
      () => {
        expect(
          TIER_LIMITS.gold
            .maxCouponBudgetTl
        ).toBeGreaterThan(0);

        expect(
          TIER_LIMITS.gold
            .maxCouponBudgetTl
        ).toBeLessThan(
          TIER_LIMITS.premium
            .maxCouponBudgetTl
        );
      }
    );

    it(
      "videos are open to every tier",
      () => {
        for (const tier of ["free", "gold", "premium"] as const) {
          expect(
            TIER_LIMITS[tier]
              .canViewHorseVideos
          ).toBe(true);
        }
      }
    );

    it(
      "value model and coupon history are premium-only",
      () => {
        expect(TIER_LIMITS.premium.canViewValueModel).toBe(true);
        expect(TIER_LIMITS.gold.canViewValueModel).toBe(false);
        expect(TIER_LIMITS.free.canViewValueModel).toBe(false);
        expect(TIER_LIMITS.premium.canViewCouponHistory).toBe(true);
        expect(TIER_LIMITS.gold.canViewCouponHistory).toBe(false);
      }
    );

    it(
      "gold has a daily coupon allowance, premium has none",
      () => {
        expect(TIER_LIMITS.gold.maxCouponRequestsPerDay).toBeGreaterThan(0);
        expect(Number.isFinite(TIER_LIMITS.gold.maxCouponRequestsPerDay)).toBe(true);
        expect(TIER_LIMITS.premium.maxCouponRequestsPerDay).toBe(Infinity);
        expect(TIER_LIMITS.free.maxCouponRequestsPerDay).toBe(0);
      }
    );
  }
);

describe(
  "PRODUCT_TIER_MAP",
  () => {
    it(
      "maps the two subscription products to gold and premium",
      () => {
        expect(
          PRODUCT_TIER_MAP
            .gold_monthly
        ).toBe(
          "gold"
        );

        expect(
          PRODUCT_TIER_MAP
            .premium_monthly
        ).toBe(
          "premium"
        );
      }
    );
  }
);

describe(
  "premium signal stripping",
  () => {
    it(
      "removes analysis fields from a runner but keeps identity fields",
      () => {
        const runner = {
          horse_number: 4,
          horse_name: "SILENT TOUCH",
          jockey: "E.AKPINAR",
          modelScore: { score: 58 },
          shadowModelScore: { score: 60 },
          marketMovement: { score: 50 },
          market_score: 50,
          fieldSignal: { score: 66 },
          field_score: 66,
          expertConsensus: { sourceCount: 1 }
        };

        const stripped =
          stripPremiumRunnerSignals(
            runner
          );

        expect(
          stripped.horse_number
        ).toBe(4);

        expect(
          stripped.horse_name
        ).toBe(
          "SILENT TOUCH"
        );

        expect(
          "modelScore" in stripped
        ).toBe(false);

        expect(
          "expertConsensus" in stripped
        ).toBe(false);

        expect(
          "marketMovement" in stripped
        ).toBe(false);

        expect(
          "fieldSignal" in stripped
        ).toBe(false);
      }
    );

    it(
      "removes uncertainty and couponStrategy from a race but keeps schedule fields",
      () => {
        const race = {
          race_number: 1,
          start_time: "13:30",
          distance_meters: 1400,
          uncertainty: { level: "medium" },
          couponStrategy: { mode: "compact" }
        };

        const stripped =
          stripPremiumRaceSignals(
            race
          );

        expect(
          stripped.race_number
        ).toBe(1);

        expect(
          stripped.distance_meters
        ).toBe(1400);

        expect(
          "uncertainty" in stripped
        ).toBe(false);

        expect(
          "couponStrategy" in stripped
        ).toBe(false);
      }
    );
  }
);
