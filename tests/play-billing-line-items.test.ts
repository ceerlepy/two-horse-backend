import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPlaySubscription } from "../src/membership/play-billing";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const env: any = {
  PLAY_PACKAGE_NAME: "com.twohorse.app",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "test@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  })
};

function mockGoogle(subscription: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "token" }))
        : new Response(JSON.stringify(subscription))
    )
  );
}

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

afterEach(() => vi.unstubAllGlobals());

describe("verifyPlaySubscription line items", () => {
  it("keeps the current plan during a deferred switch and reports the next one", async () => {
    mockGoogle({
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      linkedPurchaseToken: "old-token",
      lineItems: [
        { productId: "gold_monthly" },
        {
          productId: "premium_monthly",
          expiryTime: future(20),
          autoRenewingPlan: { autoRenewEnabled: false },
          deferredItemReplacement: { productId: "gold_monthly" }
        }
      ]
    });

    const purchase = await verifyPlaySubscription(env, "new-token");

    expect(purchase.productId).toBe("premium_monthly");
    expect(purchase.pendingProductId).toBe("gold_monthly");
    expect(purchase.active).toBe(true);
    expect(purchase.linkedPurchaseToken).toBe("old-token");
  });

  it("reports a cancelled subscription that still runs to expiry", async () => {
    mockGoogle({
      subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
      lineItems: [
        {
          productId: "premium_monthly",
          expiryTime: future(5),
          autoRenewingPlan: { autoRenewEnabled: false }
        }
      ]
    });

    const purchase = await verifyPlaySubscription(env, "token");

    expect(purchase.active).toBe(true);
    expect(purchase.autoRenewEnabled).toBe(false);
    expect(purchase.pendingProductId).toBeNull();
  });
});
