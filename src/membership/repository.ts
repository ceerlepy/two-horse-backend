import type {
  Env
} from "../env";

import {
  isoNow
} from "../shared";

import type {
  UserRecord,
  MembershipTier,
  TierSource
} from "./tier";

import {
  TRIAL_DAYS
} from "./tier";

function rowToUser(
  row: any
): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? null,
    googleSub: row.google_sub ?? null,
    passwordHash: row.password_hash ?? null,
    tier: row.tier,
    tierSource: row.tier_source,
    trialStartedAt: row.trial_started_at ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    subscriptionProductId: row.subscription_product_id ?? null,
    subscriptionExpiresAt: row.subscription_expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? null
  };
}

export async function getUserById(
  env: Env,
  id: string
): Promise<UserRecord | null> {
  const row =
    await env.DB.prepare(
      `SELECT * FROM users WHERE id = ?`
    )
      .bind(id)
      .first<any>();

  return row
    ? rowToUser(row)
    : null;
}

export async function getUserByEmail(
  env: Env,
  email: string
): Promise<UserRecord | null> {
  const row =
    await env.DB.prepare(
      `SELECT * FROM users WHERE email = ?`
    )
      .bind(
        email.toLowerCase()
      )
      .first<any>();

  return row
    ? rowToUser(row)
    : null;
}

function newTrialWindow(): {
  trialStartedAt: string;
  trialEndsAt: string;
} {
  const now = new Date();

  const ends =
    new Date(
      now.getTime() +
        TRIAL_DAYS *
        24 *
        60 *
        60 *
        1000
    );

  return {
    trialStartedAt:
      now.toISOString(),

    trialEndsAt:
      ends.toISOString()
  };
}

/*
 * Signing in with Google either creates a brand new trial user
 * or, for a returning user, only refreshes identity fields and
 * last_login_at -- it never resets tier/trial state, so a
 * repeat login can't be used to keep re-rolling a fresh trial.
 */
export async function upsertGoogleUser(
  env: Env,
  params: {
    googleSub: string;
    email: string;
    displayName: string | null;
  }
): Promise<UserRecord> {
  const existingByGoogleSub =
    await env.DB.prepare(
      `SELECT * FROM users WHERE google_sub = ?`
    )
      .bind(
        params.googleSub
      )
      .first<any>();

  if (existingByGoogleSub) {
    const now =
      isoNow();

    await env.DB.prepare(
      `UPDATE users
       SET display_name = ?,
           last_login_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        params.displayName,
        now,
        now,
        existingByGoogleSub.id
      )
      .run();

    return rowToUser({
      ...existingByGoogleSub,
      display_name: params.displayName,
      last_login_at: now,
      updated_at: now
    });
  }

  const existingByEmail =
    await getUserByEmail(
      env,
      params.email
    );

  const now =
    isoNow();

  if (existingByEmail) {
    await env.DB.prepare(
      `UPDATE users
       SET google_sub = ?,
           display_name = COALESCE(?, display_name),
           last_login_at = ?,
           updated_at = ?
       WHERE id = ?`
    )
      .bind(
        params.googleSub,
        params.displayName,
        now,
        now,
        existingByEmail.id
      )
      .run();

    return (
      await getUserById(
        env,
        existingByEmail.id
      )
    )!;
  }

  const id =
    crypto.randomUUID();

  const trial =
    newTrialWindow();

  await env.DB.prepare(
    `INSERT INTO users (
       id, email, display_name, google_sub,
       tier, tier_source,
       trial_started_at, trial_ends_at,
       created_at, updated_at, last_login_at
     ) VALUES (?, ?, ?, ?, 'premium', 'trial', ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      params.email.toLowerCase(),
      params.displayName,
      params.googleSub,
      trial.trialStartedAt,
      trial.trialEndsAt,
      now,
      now,
      now
    )
    .run();

  return (
    await getUserById(
      env,
      id
    )
  )!;
}

export async function touchLastLogin(
  env: Env,
  userId: string
): Promise<void> {
  const now =
    isoNow();

  await env.DB.prepare(
    `UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`
  )
    .bind(
      now,
      now,
      userId
    )
    .run();
}

export async function applyVerifiedPurchase(
  env: Env,
  params: {
    userId: string;
    productId: string;
    purchaseToken: string;
    orderId: string | null;
    rawStatus: string;
    expiryTimeMillis: number;
    tier: MembershipTier;
  }
): Promise<void> {
  const now =
    isoNow();

  await env.DB.prepare(
    `INSERT INTO play_purchases (
       id, user_id, product_id, purchase_token,
       order_id, raw_status, expiry_time_millis,
       verified_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(purchase_token) DO UPDATE SET
       raw_status = excluded.raw_status,
       expiry_time_millis = excluded.expiry_time_millis,
       verified_at = excluded.verified_at`
  )
    .bind(
      crypto.randomUUID(),
      params.userId,
      params.productId,
      params.purchaseToken,
      params.orderId,
      params.rawStatus,
      params.expiryTimeMillis,
      now,
      now
    )
    .run();

  await env.DB.prepare(
    `UPDATE users
     SET tier = ?,
         tier_source = 'play_subscription',
         subscription_product_id = ?,
         subscription_expires_at = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      params.tier,
      params.productId,
      new Date(
        params.expiryTimeMillis
      ).toISOString(),
      now,
      params.userId
    )
    .run();
}

export type {
  TierSource
};
