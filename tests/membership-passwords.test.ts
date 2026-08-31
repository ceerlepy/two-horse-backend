import {
  describe,
  expect,
  it
} from "vitest";

import {
  hashPassword,
  verifyPassword
} from "../src/membership/passwords";

describe(
  "membership password hashing",
  () => {
    it(
      "verifies the correct password against its own hash",
      async () => {
        const hash =
          await hashPassword(
            "Correct-Horse-Battery-9!"
          );

        expect(
          await verifyPassword(
            "Correct-Horse-Battery-9!",
            hash
          )
        ).toBe(true);
      }
    );

    it(
      "rejects a wrong password",
      async () => {
        const hash =
          await hashPassword(
            "Correct-Horse-Battery-9!"
          );

        expect(
          await verifyPassword(
            "wrong-password",
            hash
          )
        ).toBe(false);
      }
    );

    it(
      "never stores the plaintext password inside the encoded hash",
      async () => {
        const hash =
          await hashPassword(
            "Correct-Horse-Battery-9!"
          );

        expect(
          hash
        ).not.toContain(
          "Correct-Horse-Battery-9"
        );
      }
    );

    it(
      "produces a different hash each time (random salt)",
      async () => {
        const first =
          await hashPassword(
            "Correct-Horse-Battery-9!"
          );

        const second =
          await hashPassword(
            "Correct-Horse-Battery-9!"
          );

        expect(
          first
        ).not.toBe(
          second
        );
      }
    );

    it(
      "rejects malformed encoded hashes instead of throwing",
      async () => {
        expect(
          await verifyPassword(
            "anything",
            "not-a-real-hash"
          )
        ).toBe(false);
      }
    );
  }
);
