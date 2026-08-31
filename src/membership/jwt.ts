import {
  SignJWT,
  jwtVerify
} from "jose";

import type {
  Env
} from "../env";

const SESSION_TTL_SECONDS =
  60 * 60 * 24 * 30;

function sessionSecretKey(
  env: Env
): Uint8Array {
  const secret =
    env.SESSION_JWT_SECRET
      ?.trim();

  if (!secret) {
    throw new Error(
      "SESSION_JWT_SECRET_NOT_CONFIGURED"
    );
  }

  return new TextEncoder().encode(
    secret
  );
}

export async function issueSessionToken(
  env: Env,
  userId: string
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({
      alg: "HS256"
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(
      Math.floor(Date.now() / 1000) +
        SESSION_TTL_SECONDS
    )
    .sign(
      sessionSecretKey(env)
    );
}

export async function verifySessionToken(
  env: Env,
  token: string
): Promise<string | null> {
  try {
    const { payload } =
      await jwtVerify(
        token,
        sessionSecretKey(env)
      );

    return typeof payload.sub === "string"
      ? payload.sub
      : null;
  } catch {
    return null;
  }
}

export function bearerToken(
  request: Request
): string | null {
  const header =
    request.headers.get(
      "authorization"
    );

  if (
    !header?.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  const token =
    header.slice(7).trim();

  return token || null;
}
