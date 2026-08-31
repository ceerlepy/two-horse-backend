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
  applyVerifiedPurchase
} from "./repository";

import {
  verifyPlaySubscription
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

  const user =
    await getUserById(
      env,
      userId
    );

  if (!user) {
    return null;
  }

  return {
    user,
    tier:
      effectiveTier(
        user
      )
  };
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

  if (!purchase.active) {
    throw new Error(
      "PURCHASE_NOT_ACTIVE"
    );
  }

  await applyVerifiedPurchase(
    env,
    {
      userId,
      productId,
      purchaseToken,
      orderId: null,
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
