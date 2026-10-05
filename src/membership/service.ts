import type {
  Env
} from "../env";

import {
  verifyGoogleIdToken
} from "./google";

import {
  hashPassword,
  verifyPassword
} from "./passwords";

import {
  issueSessionToken,
  verifySessionToken,
  bearerToken
} from "./jwt";

import {
  getUserByEmail,
  getUserById,
  upsertGoogleUser,
  touchLastLogin,
  applyVerifiedPurchase,
  createPasswordUser,
  deleteUserAccount,
  getPurchaseOwner,
  getLatestPurchase,
  touchUpdatedAt
} from "./repository";

import {
  verifyPlaySubscription,
  acknowledgePlaySubscription
} from "./play-billing";

import {
  effectiveTier,
  PRODUCT_TIER_MAP,
  type UserRecord,
  type MembershipTier
} from "./tier";

export {
  hashPassword
};

export interface AuthContext {
  user: UserRecord;
  tier: MembershipTier;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  tier: MembershipTier;
  tierSource: string;
  trialEndsAt: string | null;
  subscriptionExpiresAt: string | null;
}

export function toPublicUser(
  user: UserRecord
): PublicUser {
  const tier =
    effectiveTier(
      user
    );

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    tier,
    tierSource: user.tierSource,
    trialEndsAt: user.trialEndsAt,
    subscriptionExpiresAt:
      user.subscriptionExpiresAt
  };
}

export async function resolveSession(
  request: Request,
  env: Env
): Promise<AuthContext | null> {
  const token =
    bearerToken(
      request
    );

  if (!token) {
    return null;
  }

  const userId =
    await verifySessionToken(
      env,
      token
    );

  if (!userId) {
    return null;
  }

  let user =
    await getUserById(
      env,
      userId
    );

  if (!user) {
    return null;
  }

  if (
    shouldRecheckSubscription(
      user
    )
  ) {
    user =
      await recheckSubscription(
        env,
        user
      );
  }

  return {
    user,
    tier:
      effectiveTier(
        user
      )
  };
}

const SUBSCRIPTION_RECHECK_INTERVAL_MS =
  60 * 60 * 1000;

/*
 * Subscriptions renew monthly on Google's side, but the stored
 * expiry only moves when we ask Google again. Once the stored
 * expiry has passed, re-ask at most once an hour (updated_at is
 * the throttle) so a renewed subscriber keeps access and a
 * cancelled one drops to free.
 */
function shouldRecheckSubscription(
  user: UserRecord,
  now: Date = new Date()
): boolean {
  if (
    user.tierSource !==
      "play_subscription" ||
    !user.subscriptionExpiresAt
  ) {
    return false;
  }

  const expiresAt =
    Date.parse(
      user.subscriptionExpiresAt
    );

  const updatedAt =
    Date.parse(
      user.updatedAt
    );

  return (
    expiresAt <= now.getTime() &&
    !(
      updatedAt >
        now.getTime() -
          SUBSCRIPTION_RECHECK_INTERVAL_MS
    )
  );
}

async function recheckSubscription(
  env: Env,
  user: UserRecord
): Promise<UserRecord> {
  try {
    const latest =
      await getLatestPurchase(
        env,
        user.id
      );

    if (latest) {
      const purchase =
        await verifyPlaySubscription(
          env,
          latest.purchaseToken
        );

      const tier =
        PRODUCT_TIER_MAP[
          purchase.productId
        ];

      if (
        purchase.active &&
        tier
      ) {
        await applyVerifiedPurchase(
          env,
          {
            userId:
              user.id,
            productId:
              purchase.productId,
            purchaseToken:
              latest.purchaseToken,
            orderId:
              purchase.orderId,
            rawStatus:
              purchase.rawStatus,
            expiryTimeMillis:
              purchase.expiryTimeMillis,
            tier
          }
        );

        return (
          await getUserById(
            env,
            user.id
          )
        ) ?? user;
      }
    }
  } catch (error) {
    console.error(
      "membership.subscription-recheck-failed",
      String(error)
    );
  }

  await touchUpdatedAt(
    env,
    user.id
  );

  return user;
}

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 80;

export async function registerWithPassword(
  env: Env,
  params: {
    email: string;
    password: string;
    displayName: string | null;
  }
): Promise<{
  token: string;
  user: PublicUser;
}> {
  const email =
    params.email.trim().toLowerCase();

  if (
    email.length > 254 ||
    !EMAIL_PATTERN.test(email)
  ) {
    throw new Error(
      "INVALID_EMAIL"
    );
  }

  if (
    params.password.length <
      PASSWORD_MIN_LENGTH ||
    params.password.length >
      PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      "WEAK_PASSWORD"
    );
  }

  const displayName =
    params.displayName
      ?.trim()
      .slice(
        0,
        DISPLAY_NAME_MAX_LENGTH
      ) || null;

  const user =
    await createPasswordUser(
      env,
      {
        email,
        passwordHash:
          await hashPassword(
            params.password
          ),
        displayName
      }
    );

  const token =
    await issueSessionToken(
      env,
      user.id
    );

  return {
    token,
    user:
      toPublicUser(
        user
      )
  };
}

export async function deleteAccount(
  env: Env,
  user: UserRecord
): Promise<void> {
  // Admin accounts are seeded by migration, not self-service.
  if (
    user.tierSource ===
      "manual"
  ) {
    throw new Error(
      "MANUAL_ACCOUNT_NOT_DELETABLE"
    );
  }

  await deleteUserAccount(
    env,
    user
  );
}

export async function loginWithGoogle(
  env: Env,
  idToken: string
): Promise<{
  token: string;
  user: PublicUser;
}> {
  const identity =
    await verifyGoogleIdToken(
      env,
      idToken
    );

  if (!identity.emailVerified) {
    throw new Error(
      "GOOGLE_EMAIL_NOT_VERIFIED"
    );
  }

  const user =
    await upsertGoogleUser(
      env,
      {
        googleSub:
          identity.sub,
        email:
          identity.email,
        displayName:
          identity.name
      }
    );

  const token =
    await issueSessionToken(
      env,
      user.id
    );

  return {
    token,
    user:
      toPublicUser(
        user
      )
  };
}

export async function loginWithPassword(
  env: Env,
  email: string,
  password: string
): Promise<{
  token: string;
  user: PublicUser;
}> {
  const user =
    await getUserByEmail(
      env,
      email
    );

  if (
    !user ||
    !user.passwordHash
  ) {
    throw new Error(
      "INVALID_CREDENTIALS"
    );
  }

  const valid =
    await verifyPassword(
      password,
      user.passwordHash
    );

  if (!valid) {
    throw new Error(
      "INVALID_CREDENTIALS"
    );
  }

  await touchLastLogin(
    env,
    user.id
  );

  const token =
    await issueSessionToken(
      env,
      user.id
    );

  return {
    token,
    user:
      toPublicUser(
        user
      )
  };
}

export async function verifyPurchaseAndUpgrade(
  env: Env,
  userId: string,
  productId: string,
  purchaseToken: string
): Promise<PublicUser> {
  const tier =
    PRODUCT_TIER_MAP[
      productId
    ];

  if (!tier) {
    throw new Error(
      "UNKNOWN_PRODUCT_ID"
    );
  }

  /*
   * A purchase token belongs to the account that first verified
   * it. Without this, anyone holding someone else's token (or a
   * second account on the same phone) could unlock a paid tier.
   */
  const owner =
    await getPurchaseOwner(
      env,
      purchaseToken
    );

  if (
    owner &&
    owner !== userId
  ) {
    throw new Error(
      "PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT"
    );
  }

  const purchase =
    await verifyPlaySubscription(
      env,
      purchaseToken
    );

  if (
    purchase.productId !==
    productId
  ) {
    throw new Error(
      "PURCHASE_PRODUCT_MISMATCH"
    );
  }

  // The app tags each purchase with the buyer's user id.
  if (
    purchase.obfuscatedAccountId &&
    purchase.obfuscatedAccountId !==
      userId
  ) {
    throw new Error(
      "PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT"
    );
  }

  if (!purchase.active) {
    throw new Error(
      "PURCHASE_NOT_ACTIVE"
    );
  }

  if (purchase.needsAcknowledgement) {
    try {
      await acknowledgePlaySubscription(
        env,
        productId,
        purchaseToken
      );
    } catch (error) {
      // The app acknowledges as well; don't fail the upgrade on this.
      console.error(
        "membership.acknowledge-failed",
        String(error)
      );
    }
  }

  await applyVerifiedPurchase(
    env,
    {
      userId,
      productId,
      purchaseToken,
      orderId:
        purchase.orderId,
      rawStatus:
        purchase.rawStatus,
      expiryTimeMillis:
        purchase.expiryTimeMillis,
      tier
    }
  );

  const user =
    await getUserById(
      env,
      userId
    );

  if (!user) {
    throw new Error(
      "USER_NOT_FOUND_AFTER_PURCHASE"
    );
  }

  return toPublicUser(
    user
  );
}
