import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  TIER_LIMITS,
  type MembershipTier
} from "./tier";

export interface CouponRequestIdentity {
  city: string;
  pool: string;
  windowNumber: number;
  budgetTl: number;
}

export interface CouponAllowance {
  allowed: boolean;
  used: number;
  limit: number;
}

export function couponRequestKey(
  request: CouponRequestIdentity
): string {
  return [
    request.city.trim().toLocaleLowerCase("tr-TR"),
    request.pool,
    request.windowNumber,
    request.budgetTl
  ].join("|");
}

/*
 * Says whether a coupon request may go ahead under the user's daily
 * allowance. A request the user already made today is always allowed
 * and not counted again, so re-opening the same coupon is free.
 * Nothing is written here: recordCouponRequest() counts the request
 * only after the coupon was actually produced, so a failed request
 * (no such window, results already in) never costs the user a slot.
 */
export async function checkCouponAllowance(
  env: Env,
  userId: string,
  tier: MembershipTier,
  request: CouponRequestIdentity,
  now: Date = new Date()
): Promise<CouponAllowance> {
  const limit =
    TIER_LIMITS[tier].maxCouponRequestsPerDay;

  if (limit === Infinity) {
    return {
      allowed: true,
      used: 0,
      limit
    };
  }

  const existing =
    await env.DB.prepare(
      `SELECT
         COUNT(*) AS used,
         SUM(CASE WHEN request_key = ? THEN 1 ELSE 0 END) AS repeated
       FROM coupon_request_log
       WHERE user_id = ? AND usage_date = ?`
    )
      .bind(
        couponRequestKey(request),
        userId,
        turkeyDate(now)
      )
      .first<{ used: number; repeated: number | null }>();

  const used =
    Number(existing?.used ?? 0);

  return {
    allowed:
      Number(existing?.repeated ?? 0) > 0 ||
      used < limit,
    used,
    limit
  };
}

export async function recordCouponRequest(
  env: Env,
  userId: string,
  tier: MembershipTier,
  request: CouponRequestIdentity,
  now: Date = new Date()
): Promise<void> {
  if (
    TIER_LIMITS[tier].maxCouponRequestsPerDay === Infinity
  ) {
    return;
  }

  await env.DB.prepare(
    `INSERT INTO coupon_request_log (user_id, usage_date, request_key, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, usage_date, request_key) DO NOTHING`
  )
    .bind(
      userId,
      turkeyDate(now),
      couponRequestKey(request),
      now.toISOString()
    )
    .run();
}
