import {
  createRemoteJWKSet,
  jwtVerify
} from "jose";

import type {
  Env
} from "../env";

const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/oauth2/v3/certs";

const GOOGLE_ISSUERS =
  [
    "https://accounts.google.com",
    "accounts.google.com"
  ];

/*
 * Fetched once per isolate and cached by jose according to the
 * endpoint's own cache-control headers, not per request.
 */
const googleJwks =
  createRemoteJWKSet(
    new URL(
      GOOGLE_JWKS_URL
    )
  );

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export async function verifyGoogleIdToken(
  env: Env,
  idToken: string
): Promise<GoogleIdentity> {
  const clientId =
    env.GOOGLE_CLIENT_ID
      ?.trim();

  if (!clientId) {
    throw new Error(
      "GOOGLE_CLIENT_ID_NOT_CONFIGURED"
    );
  }

  const { payload } =
    await jwtVerify(
      idToken,
      googleJwks,
      {
        issuer:
          GOOGLE_ISSUERS,
        audience:
          clientId
      }
    );

  const email =
    typeof payload.email === "string"
      ? payload.email
      : null;

  if (!email) {
    throw new Error(
      "GOOGLE_TOKEN_MISSING_EMAIL"
    );
  }

  return {
    sub:
      String(
        payload.sub
      ),

    email:
      email.toLowerCase(),

    emailVerified:
      payload.email_verified ===
        true,

    name:
      typeof payload.name === "string"
        ? payload.name
        : null
  };
}
