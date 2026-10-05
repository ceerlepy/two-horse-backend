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
  TRIAL_DAYS,
  TRIAL_TIER
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
    emailVerified: Number(row.email_verified ?? 1) === 1,
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

async function sha256Hex(
  value: string
): Promise<string> {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        value
      )
    );

  return [
    ...new Uint8Array(digest)
  ]
    .map(b =>
      b.toString(16).padStart(2, "0")
    )
    .join("");
}

function identityKeys(
  params: {
    email: string;
    googleSub?: string | null;
  }
): string[] {
  const keys = [
    `email:${params.email.trim().toLowerCase()}`
  ];

  if (params.googleSub) {
    keys.push(
      `google:${params.googleSub}`
    );
  }

  return keys;
}

async function hasClaimedTrial(
  env: Env,
  params: {
    email: string;
    googleSub?: string | null;
  }
): Promise<boolean> {
  for (
    const key of
      identityKeys(params)
  ) {
    const row =
      await env.DB.prepare(
        `SELECT 1 FROM trial_claims WHERE identity_hash = ?`
      )
        .bind(
          await sha256Hex(key)
        )
        .first();

    if (row) {
      return true;
    }
  }

  return false;
}

/*
 * A brand new account gets the trial tier for TRIAL_DAYS -- unless
 * the same email or Google account already used a trial and then
 * deleted itself, in which case it starts on free with no trial.
 */
async function initialTierFor(
  env: Env,
  params: {
    email: string;
    googleSub?: string | null;
  }
): Promise<{
  tier: MembershipTier;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
}> {
  if (
    await hasClaimedTrial(
      env,
      params
    )
  ) {
    return {
      tier: "free",
      trialStartedAt: null,
      trialEndsAt: null
    };
  }

  return {
    tier: TRIAL_TIER,
    ...newTrialWindow()
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
    /*
     * Google has just proven this address. If the existing account
     * was self-registered with an unverified email, drop its
     * password: whoever set it may not own the address.
     */
    await env.DB.prepare(
      `UPDATE users
       SET google_sub = ?,
           display_name = COALESCE(?, display_name),
           password_hash = CASE WHEN email_verified = 1 THEN password_hash ELSE NULL END,
           email_verified = 1,
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
    await initialTierFor(
      env,
      params
    );

  await env.DB.prepare(
    `INSERT INTO users (
       id, email, display_name, google_sub,
       tier, tier_source,
       trial_started_at, trial_ends_at,
       created_at, updated_at, last_login_at,
       email_verified
     ) VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?, ?, ?, 1)`
  )
    .bind(
      id,
      params.email.toLowerCase(),
      params.displayName,
      params.googleSub,
      trial.tier,
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

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super(
      "EMAIL_ALREADY_REGISTERED"
    );
  }
}

/*
 * Self-registration with email + password. The address is not
 * verified yet (email_verified = 0); see upsertGoogleUser for what
 * happens when Google later proves it.
 */
export async function createPasswordUser(
  env: Env,
  params: {
    email: string;
    passwordHash: string;
    displayName: string | null;
  }
): Promise<UserRecord> {
  const email =
    params.email.trim().toLowerCase();

  if (
    await getUserByEmail(
      env,
      email
    )
  ) {
    throw new EmailAlreadyRegisteredError();
  }

  const id =
    crypto.randomUUID();

  const now =
    isoNow();

  const trial =
    await initialTierFor(
      env,
      {
        email
      }
    );

  try {
    await env.DB.prepare(
      `INSERT INTO users (
         id, email, display_name, password_hash,
         tier, tier_source,
         trial_started_at, trial_ends_at,
         created_at, updated_at, last_login_at,
         email_verified
       ) VALUES (?, ?, ?, ?, ?, 'trial', ?, ?, ?, ?, ?, 0)`
    )
      .bind(
        id,
        email,
        params.displayName,
        params.passwordHash,
        trial.tier,
        trial.trialStartedAt,
        trial.trialEndsAt,
        now,
        now,
        now
      )
      .run();
  } catch (error) {
    // Lost a race with a concurrent registration of the same email.
    if (
      String(error).includes(
        "UNIQUE"
      )
    ) {
      throw new EmailAlreadyRegisteredError();
    }

    throw error;
  }

  return (
    await getUserById(
      env,
      id
    )
  )!;
}

/*
 * Permanently deletes the account and its purchase records (Google
 * Play's account-deletion requirement: deactivation is not enough).
 * Only one-way hashes of the identities are kept, so the same
 * email / Google account can't claim a second free trial.
 */
export async function deleteUserAccount(
  env: Env,
  user: UserRecord
): Promise<void> {
  const now =
    isoNow();

  const claims =
    await Promise.all(
      identityKeys({
        email: user.email,
        googleSub: user.googleSub
      }).map(sha256Hex)
    );

  await env.DB.batch([
    ...claims.map(hash =>
      env.DB.prepare(
        `INSERT INTO trial_claims (identity_hash, claimed_at)
         VALUES (?, ?)
         ON CONFLICT(identity_hash) DO NOTHING`
      ).bind(
        hash,
        now
      )
    ),

    env.DB.prepare(
      `DELETE FROM play_purchases WHERE user_id = ?`
    ).bind(
      user.id
    ),

    env.DB.prepare(
      `DELETE FROM coupon_request_log WHERE user_id = ?`
    ).bind(
      user.id
    ),

    env.DB.prepare(
      `DELETE FROM users WHERE id = ?`
    ).bind(
      user.id
    )
  ]);
}

export async function getPurchaseOwner(
  env: Env,
  purchaseToken: string
): Promise<string | null> {
  const row =
    await env.DB.prepare(
      `SELECT user_id FROM play_purchases WHERE purchase_token = ?`
    )
      .bind(
        purchaseToken
      )
      .first<{ user_id: string }>();

  return row?.user_id ?? null;
}

export async function getLatestPurchase(
  env: Env,
  userId: string
): Promise<{
  productId: string;
  purchaseToken: string;
} | null> {
  const row =
    await env.DB.prepare(
      `SELECT product_id, purchase_token
       FROM play_purchases
       WHERE user_id = ?
       ORDER BY expiry_time_millis DESC
       LIMIT 1`
    )
      .bind(
        userId
      )
      .first<any>();

  return row
    ? {
        productId: row.product_id,
        purchaseToken: row.purchase_token
      }
    : null;
}

export async function touchUpdatedAt(
  env: Env,
  userId: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET updated_at = ? WHERE id = ?`
  )
    .bind(
      isoNow(),
      userId
    )
    .run();
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
