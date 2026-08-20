import type {
  Env
} from "../env";

import {
  json
} from "../shared";

import {
  logger
} from "../observability/logger";

export function protectedOperationalRequest(
  request: Request
): boolean {
  const url =
    new URL(
      request.url
    );

  return (
    url.pathname.startsWith(
      "/api/admin/"
    ) ||
    url.pathname.startsWith(
      "/api/debug/"
    ) ||
    (
      url.pathname ===
        "/api/coupons/generate" &&
      request.method ===
        "POST"
    )
  );
}

export function adminAuthFailure(
  request: Request,
  env: Env
): Response | null {
  if (
    !protectedOperationalRequest(
      request
    )
  ) {
    return null;
  }

  const expected =
    env.ADMIN_TOKEN
      ?.trim();

  if (!expected) {
    logger.error(
      env,
      "auth.not-configured",
      {
        route:
          new URL(
            request.url
          ).pathname
      }
    );

    return json(
      {
        ok: false,
        error:
          "ADMIN_AUTH_NOT_CONFIGURED"
      },
      503
    );
  }

  const authorization =
    request.headers.get(
      "authorization"
    );

  const explicit =
    request.headers.get(
      "x-admin-token"
    );

  const supplied =
    authorization
      ?.startsWith(
        "Bearer "
      )
      ? authorization
          .slice(7)
          .trim()
      : explicit
          ?.trim();

  if (
    !supplied ||
    supplied !== expected
  ) {
    logger.debug(
      env,
      "auth.rejected",
      {
        route:
          new URL(
            request.url
          ).pathname
      }
    );

    return json(
      {
        ok: false,
        error:
          "UNAUTHORIZED"
      },
      401
    );
  }

  return null;
}
