import {
  describe,
  expect,
  it
} from "vitest";

import { createSqliteD1 } from "./helpers/sqlite-d1";

import {
  registerWithPassword,
  loginWithPassword,
  deleteAccount
} from "../src/membership/service";

import {
  requestPasswordReset,
  confirmPasswordReset,
  RESET_SENDER
} from "../src/membership/password-reset";

import { getUserByEmail } from "../src/membership/repository";
import { legalPage } from "../src/api/legal-pages";

function testEnv(): any {
  const sent: any[] = [];

  return {
    DB: createSqliteD1([
      "migrations/0029_membership.sql",
      "migrations/0042_membership_signup.sql",
      "migrations/0045_coupon_allowance.sql",
      "migrations/0046_ask_ai.sql",
      "migrations/0047_my_coupons.sql",
      "migrations/0050_subscription_state.sql",
      "migrations/0052_password_resets.sql"
    ]),
    SESSION_JWT_SECRET: "test-only-session-secret-not-real",
    EMAIL: {
      send: async (message: any) => {
        sent.push(message);
        return { messageId: `m${sent.length}` };
      }
    },
    sent
  };
}

function codeFrom(message: any): string {
  return String(message.text).match(/\b(\d{6})\b/)![1];
}

describe("password reset", () => {
  it("mails a code from the support address and the code sets a new password", async () => {
    const env = testEnv();
    await registerWithPassword(env, {
      email: "uye@example.com",
      password: "old-password-1",
      displayName: null
    });

    await requestPasswordReset(env, " Uye@Example.com ", "tr");

    expect(env.sent).toHaveLength(1);
    expect(env.sent[0].from.email).toBe(RESET_SENDER);
    expect(env.sent[0].to).toBe("uye@example.com");
    expect(env.sent[0].subject).toContain("şifre");

    const { token, user } = await confirmPasswordReset(env, {
      email: "uye@example.com",
      code: codeFrom(env.sent[0]),
      newPassword: "new-password-2"
    });

    expect(token).toBeTruthy();
    expect(user.email).toBe("uye@example.com");
    await expect(loginWithPassword(env, "uye@example.com", "old-password-1")).rejects.toThrow("INVALID_CREDENTIALS");
    expect((await loginWithPassword(env, "uye@example.com", "new-password-2")).user.id).toBe(user.id);
    expect((await getUserByEmail(env, "uye@example.com"))?.emailVerified).toBe(true);

    /* A used code is gone. */
    await expect(confirmPasswordReset(env, {
      email: "uye@example.com",
      code: codeFrom(env.sent[0]),
      newPassword: "third-password-3"
    })).rejects.toThrow("INVALID_RESET_CODE");
  });

  it("sends nothing for an unknown email and does not reveal it", async () => {
    const env = testEnv();
    await expect(requestPasswordReset(env, "kimse@example.com", "tr")).resolves.toBeUndefined();
    expect(env.sent).toHaveLength(0);
  });

  it("throttles resends to one a minute", async () => {
    const env = testEnv();
    await registerWithPassword(env, { email: "a@example.com", password: "long-enough-pw", displayName: null });

    const t0 = new Date("2026-10-10T08:00:00Z");
    await requestPasswordReset(env, "a@example.com", "en", t0);
    await requestPasswordReset(env, "a@example.com", "en", new Date(t0.getTime() + 30_000));
    expect(env.sent).toHaveLength(1);
    expect(env.sent[0].subject).toContain("password");

    await requestPasswordReset(env, "a@example.com", "en", new Date(t0.getTime() + 61_000));
    expect(env.sent).toHaveLength(2);
  });

  it("rejects wrong codes, locks after five tries and expires after 15 minutes", async () => {
    const env = testEnv();
    await registerWithPassword(env, { email: "b@example.com", password: "long-enough-pw", displayName: null });

    const t0 = new Date();
    await requestPasswordReset(env, "b@example.com", "tr", t0);
    const code = codeFrom(env.sent[0]);
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      await expect(confirmPasswordReset(env, { email: "b@example.com", code: wrong, newPassword: "new-password-2" }))
        .rejects.toThrow("INVALID_RESET_CODE");
    }
    await expect(confirmPasswordReset(env, { email: "b@example.com", code, newPassword: "new-password-2" }))
      .rejects.toThrow("INVALID_RESET_CODE");

    const t1 = new Date(t0.getTime() + 2 * 60_000);
    await requestPasswordReset(env, "b@example.com", "tr", t1);
    const fresh = codeFrom(env.sent[1]);
    await expect(confirmPasswordReset(env, { email: "b@example.com", code: fresh, newPassword: "new-password-2" },
      new Date(t1.getTime() + 16 * 60_000))).rejects.toThrow("INVALID_RESET_CODE");
    await expect(confirmPasswordReset(env, { email: "b@example.com", code: fresh, newPassword: "short" }, t1))
      .rejects.toThrow("WEAK_PASSWORD");
  });

  it("removes a pending code when the account is deleted", async () => {
    const env = testEnv();
    await registerWithPassword(env, { email: "c@example.com", password: "long-enough-pw", displayName: null });
    await requestPasswordReset(env, "c@example.com", "tr");
    await deleteAccount(env, (await getUserByEmail(env, "c@example.com"))!);

    const row = await env.DB.prepare(`SELECT email FROM password_reset_codes WHERE email = ?`).bind("c@example.com").first();
    expect(row).toBeNull();
  });
});

describe("legal pages", () => {
  it("serves the privacy and deletion pages in both languages", async () => {
    for (const path of ["/gizlilik", "/privacy", "/hesap-silme", "/delete-account/"]) {
      const response = legalPage(path)!;
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("destek@twohorse.app");
    }
    expect(legalPage("/api/today")).toBeNull();
  });
});
