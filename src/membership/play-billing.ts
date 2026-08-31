import {
  SignJWT,
  importPKCS8
} from "jose";

import type {
  Env
} from "../env";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface PlaySubscriptionPurchase {
  productId: string;
  expiryTimeMillis: number;
  active: boolean;
  rawStatus: string;
}

function parseServiceAccount(
  env: Env
): ServiceAccountKey {
  const raw =
    env.GOOGLE_SERVICE_ACCOUNT_JSON
      ?.trim();

  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_NOT_CONFIGURED"
    );
  }

  const parsed =
    JSON.parse(raw) as
      Partial<ServiceAccountKey>;

  if (
    !parsed.client_email ||
    !parsed.private_key
  ) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_INVALID"
    );
  }

  return parsed as ServiceAccountKey;
}

async function fetchAccessToken(
  account: ServiceAccountKey
): Promise<string> {
  const privateKey =
    await importPKCS8(
      account.private_key,
      "RS256"
    );

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const assertion =
    await new SignJWT({
      scope:
        "https://www.googleapis.com/auth/androidpublisher"
    })
      .setProtectedHeader({
        alg: "RS256"
      })
      .setIssuer(
        account.client_email
      )
      .setAudience(
        "https://oauth2.googleapis.com/token"
      )
      .setIssuedAt(
        now
      )
      .setExpirationTime(
        now + 3600
      )
      .sign(
        privateKey
      );

  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            grant_type:
              "urn:ietf:params:oauth:grant-type:jwt-bearer",

            assertion
          })
      }
    );

  if (!response.ok) {
    throw new Error(
      `PLAY_TOKEN_EXCHANGE_FAILED_${response.status}`
    );
  }

  const body =
    await response.json<{
      access_token?: string;
    }>();

  if (!body.access_token) {
    throw new Error(
      "PLAY_TOKEN_EXCHANGE_MISSING_TOKEN"
    );
  }

  return body.access_token;
}

/*
 * Verifies a subscription purchase token against the Play
 * Developer API's subscriptionsv2 endpoint. This is the only
 * source of truth for whether a client's claimed purchase is
 * real and current -- the client's own "I bought it" is never
 * trusted.
 */
export async function verifyPlaySubscription(
  env: Env,
  purchaseToken: string
): Promise<PlaySubscriptionPurchase> {
  const packageName =
    env.PLAY_PACKAGE_NAME
      ?.trim();

  if (!packageName) {
    throw new Error(
      "PLAY_PACKAGE_NAME_NOT_CONFIGURED"
    );
  }

  const account =
    parseServiceAccount(
      env
    );

  const accessToken =
    await fetchAccessToken(
      account
    );

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/` +
    `${encodeURIComponent(purchaseToken)}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          authorization:
            `Bearer ${accessToken}`
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `PLAY_PURCHASE_LOOKUP_FAILED_${response.status}`
    );
  }

  const body =
    await response.json<any>();

  const lineItem =
    (body.lineItems ?? [])[0];

  if (!lineItem) {
    throw new Error(
      "PLAY_PURCHASE_NO_LINE_ITEMS"
    );
  }

  const expiryTimeMillis =
    Date.parse(
      lineItem.expiryTime
    );

  const rawStatus =
    String(
      body.subscriptionState ??
        "SUBSCRIPTION_STATE_UNSPECIFIED"
    );

  const active =
    Number.isFinite(
      expiryTimeMillis
    ) &&
    expiryTimeMillis >
      Date.now() &&
    rawStatus !==
      "SUBSCRIPTION_STATE_EXPIRED" &&
    rawStatus !==
      "SUBSCRIPTION_STATE_REVOKED";

  return {
    productId:
      String(
        lineItem.productId
      ),

    expiryTimeMillis,
    active,
    rawStatus
  };
}
