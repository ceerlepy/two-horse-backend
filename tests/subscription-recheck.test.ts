import {
  describe,
  expect,
  it
} from "vitest";

import {
  inactiveEntitlementEnd,
  shouldRecheckSubscription
} from "../src/membership/service";

const now = new Date("2026-10-10T12:00:00Z");

function user(expiresAt: string | null, updatedAt: string, tierSource = "play_subscription") {
  return {
    tierSource: tierSource as any,
    subscriptionExpiresAt: expiresAt,
    updatedAt
  };
}

describe("subscription recheck", () => {
  it("rechecks an active subscription every 6 hours so a revoked one drops", () => {
    expect(shouldRecheckSubscription(user("2026-11-01T00:00:00Z", "2026-10-10T07:00:00Z"), now)).toBe(false);
    expect(shouldRecheckSubscription(user("2026-11-01T00:00:00Z", "2026-10-10T05:59:00Z"), now)).toBe(true);
  });

  it("rechecks an expired subscription hourly and never touches trials or manual tiers", () => {
    expect(shouldRecheckSubscription(user("2026-10-10T10:00:00Z", "2026-10-10T11:30:00Z"), now)).toBe(false);
    expect(shouldRecheckSubscription(user("2026-10-10T10:00:00Z", "2026-10-10T10:59:00Z"), now)).toBe(true);
    expect(shouldRecheckSubscription(user("2026-11-01T00:00:00Z", "2026-01-01T00:00:00Z", "trial"), now)).toBe(false);
    expect(shouldRecheckSubscription(user(null, "2026-01-01T00:00:00Z", "manual"), now)).toBe(false);
  });

  it("ends access now when Google no longer entitles the purchase", () => {
    /* Revoked after a refund: Google moves expiry to the revoke time. */
    expect(inactiveEntitlementEnd("2026-11-01T00:00:00Z", Date.parse("2026-10-10T09:00:00Z"), now))
      .toBe("2026-10-10T09:00:00.000Z");
    /* Inactive state with a future expiry (on hold, paused): ends now. */
    expect(inactiveEntitlementEnd("2026-11-01T00:00:00Z", Date.parse("2026-10-20T00:00:00Z"), now))
      .toBe(now.toISOString());
    /* Already past the stored expiry: nothing to change. */
    expect(inactiveEntitlementEnd("2026-10-01T00:00:00Z", Date.parse("2026-10-01T00:00:00Z"), now)).toBeNull();
    expect(inactiveEntitlementEnd(null, Date.parse("2026-10-01T00:00:00Z"), now)).toBeNull();
  });
});
