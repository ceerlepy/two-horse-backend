import {
  describe,
  expect,
  it,
  vi,
  afterEach
} from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";

import {
  registerWithPassword,
  loginWithPassword,
  deleteAccount,
  verifyPurchaseAndUpgrade
} from "../src/membership/service";

import {
  getUserByEmail,
  upsertGoogleUser,
  applyVerifiedPurchase
} from "../src/membership/repository";

import { effectiveTier } from "../src/membership/tier";

function testEnv(): any {
  return {
    DB: createSqliteD1([
      "migrations/0029_membership.sql",
      "migrations/0042_membership_signup.sql",
      "migrations/0045_coupon_allowance.sql",
      "migrations/0046_ask_ai.sql",
      "migrations/0047_my_coupons.sql",
      "migrations/0050_subscription_state.sql"
    ]),
    SESSION_JWT_SECRET: "test-only-session-secret-not-real"
  };
}

describe("email registration", () => {
  it("creates an unverified account on a 7-day Gold trial and can log in", async () => {
    const env = testEnv();

    const { token, user } =
      await registerWithPassword(env, {
        email: " New.User@Example.com ",
        password: "long-enough-pw",
        displayName: "Yeni"
      });

    expect(token).toBeTruthy();
    expect(user.email).toBe("new.user@example.com");
    expect(user.tier).toBe("premium");
    expect(user.tierSource).toBe("trial");

    const days =
      (Date.parse(user.trialEndsAt!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const stored = await getUserByEmail(env, "new.user@example.com");
    expect(stored?.emailVerified).toBe(false);

    const login =
      await loginWithPassword(env, "new.user@example.com", "long-enough-pw");
    expect(login.user.id).toBe(user.id);
  });

  it("rejects duplicate emails, bad emails and short passwords", async () => {
    const env = testEnv();

    await registerWithPassword(env, {
      email: "a@example.com",
      password: "long-enough-pw",
      displayName: null
    });

    await expect(
      registerWithPassword(env, {
        email: "A@example.com",
        password: "another-long-pw",
        displayName: null
      })
    ).rejects.toThrow("EMAIL_ALREADY_REGISTERED");

    await expect(
      registerWithPassword(env, {
        email: "not-an-email",
        password: "long-enough-pw",
        displayName: null
      })
    ).rejects.toThrow("INVALID_EMAIL");

    await expect(
      registerWithPassword(env, {
        email: "b@example.com",
        password: "short",
        displayName: null
      })
    ).rejects.toThrow("WEAK_PASSWORD");
  });
});

describe("google linking", () => {
  it("drops the password of a self-registered account when Google proves the email", async () => {
    const env = testEnv();

    await registerWithPassword(env, {
      email: "victim@example.com",
      password: "set-by-someone",
      displayName: null
    });

    const linked = await upsertGoogleUser(env, {
      googleSub: "google-sub-1",
      email: "victim@example.com",
      displayName: "Victim"
    });

    expect(linked.googleSub).toBe("google-sub-1");
    expect(linked.passwordHash).toBeNull();
    expect(linked.emailVerified).toBe(true);

    await expect(
      loginWithPassword(env, "victim@example.com", "set-by-someone")
    ).rejects.toThrow("INVALID_CREDENTIALS");
  });
});

describe("account deletion", () => {
  it("deletes the account and does not grant a second trial on re-registration", async () => {
    const env = testEnv();

    const first = await upsertGoogleUser(env, {
      googleSub: "google-sub-2",
      email: "again@example.com",
      displayName: null
    });
    expect(effectiveTier(first)).toBe("premium");

    await deleteAccount(env, first);
    expect(await getUserByEmail(env, "again@example.com")).toBeNull();

    const second = await registerWithPassword(env, {
      email: "again@example.com",
      password: "long-enough-pw",
      displayName: null
    });
    expect(second.user.tier).toBe("free");
    expect(second.user.trialEndsAt).toBeNull();
  });

  it("refuses to delete manually managed (admin) accounts", async () => {
    const env = testEnv();
    const { user } = await registerWithPassword(env, {
      email: "admin@example.com",
      password: "long-enough-pw",
      displayName: null
    });
    await env.DB.prepare(
      `UPDATE users SET tier_source = 'manual' WHERE id = ?`
    ).bind(user.id).run();
    const stored = (await getUserByEmail(env, "admin@example.com"))!;

    await expect(deleteAccount(env, stored)).rejects.toThrow(
      "MANUAL_ACCOUNT_NOT_DELETABLE"
    );
  });
});

describe("purchase ownership", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a purchase token already verified for a different account", async () => {
    const env = testEnv();

    const a = await registerWithPassword(env, {
      email: "buyer@example.com",
      password: "long-enough-pw",
      displayName: null
    });
    const b = await registerWithPassword(env, {
      email: "other@example.com",
      password: "long-enough-pw",
      displayName: null
    });

    await applyVerifiedPurchase(env, {
      userId: a.user.id,
      productId: "gold_monthly",
      purchaseToken: "token-1",
      orderId: null,
      rawStatus: "SUBSCRIPTION_STATE_ACTIVE",
      expiryTimeMillis: Date.now() + 86_400_000,
      tier: "gold"
    });

    // Never reaches Google: ownership is checked first.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      verifyPurchaseAndUpgrade(env, b.user.id, "gold_monthly", "token-1")
    ).rejects.toThrow("PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
