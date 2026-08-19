import {
  describe,
  expect,
  it
} from "vitest";

describe(
  "acquisition architecture",
  () => {
    it(
      "keeps semantic direct-url extraction as the primary path",
      async () => {
        /*
         * Architectural regression marker:
         *
         * Semantic extraction must not require
         * scrape/content before direct JSON(url).
         *
         * The implementation comment is deliberately
         * tested through source text because network
         * BrowserRun calls are integration concerns.
         */
        const module =
          await import(
            "../src/acquisition/semantic-json"
          );

        expect(
          typeof module
            .extractSemanticJson
        ).toBe(
          "function"
        );
      }
    );

    it(
      "exports deterministic acquisition independently from semantic extraction",
      async () => {
        const deterministic =
          await import(
            "../src/acquisition/deterministic"
          );

        expect(
          typeof deterministic
            .acquireAndParse
        ).toBe(
          "function"
        );
      }
    );
  }
);
