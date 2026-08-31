import {
  describe,
  expect,
  it
} from "vitest";

import type {
  Env
} from "../src/env";

import {
  issueSessionToken,
  verifySessionToken,
  bearerToken
} from "../src/membership/jwt";

function fakeEnv(
  secret = "test-secret-value-please-ignore"
): Env {
  return {
    SESSION_JWT_SECRET: secret
  } as unknown as Env;
}

describe(
  "session JWT",
  () => {
    it(
      "round-trips the subject through issue + verify",
      async () => {
        const env =
          fakeEnv();

        const token =
          await issueSessionToken(
            env,
            "user-123"
          );

        expect(
          await verifySessionToken(
            env,
            token
          )
        ).toBe(
          "user-123"
        );
      }
    );

    it(
      "rejects a token signed with a different secret",
      async () => {
        const token =
          await issueSessionToken(
            fakeEnv(
              "secret-a"
            ),
            "user-123"
          );

        expect(
          await verifySessionToken(
            fakeEnv(
              "secret-b"
            ),
            token
          )
        ).toBeNull();
      }
    );

    it(
      "rejects a garbage token instead of throwing",
      async () => {
        expect(
          await verifySessionToken(
            fakeEnv(),
            "not-a-jwt"
          )
        ).toBeNull();
      }
    );

    it(
      "extracts a bearer token from the authorization header",
      () => {
        const request =
          new Request(
            "https://example.com",
            {
              headers: {
                authorization:
                  "Bearer abc.def.ghi"
              }
            }
          );

        expect(
          bearerToken(
            request
          )
        ).toBe(
          "abc.def.ghi"
        );
      }
    );

    it(
      "returns null when there is no bearer token",
      () => {
        const request =
          new Request(
            "https://example.com"
          );

        expect(
          bearerToken(
            request
          )
        ).toBeNull();
      }
    );
  }
);
