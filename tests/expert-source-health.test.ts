import {
  describe,
  expect,
  it
} from "vitest";

import {
  resolutionBlockedByAccess
} from "../src/experts/service";

import {
  deriveEffectiveSourceStatus
} from "../src/experts/source-repository";


describe(
  "expert source health classification (Part 6)",
  () => {
    it(
      "detects a genuine access-restricted verified candidate",
      () => {
        expect(
          resolutionBlockedByAccess({
            diagnostics: {
              final: {
                verified: [
                  { status: "verified" },
                  { status: "access-restricted" }
                ]
              }
            }
          })
        )
          .toBe(true);
      }
    );


    it(
      "does not flag a resolution with no restricted candidates",
      () => {
        expect(
          resolutionBlockedByAccess({
            diagnostics: {
              final: {
                verified: [
                  { status: "verified" }
                ]
              }
            }
          })
        )
          .toBe(false);
      }
    );


    it(
      "degrades gracefully for adapters without this diagnostics shape",
      () => {
        expect(
          resolutionBlockedByAccess({})
        )
          .toBe(false);

        expect(
          resolutionBlockedByAccess(null)
        )
          .toBe(false);

        expect(
          resolutionBlockedByAccess({
            diagnostics: {}
          })
        )
          .toBe(false);
      }
    );


    it(
      "marks a healthy source stale once it stops being checked",
      () => {
        expect(
          deriveEffectiveSourceStatus(
            "healthy",
            "2026-08-27T09:00:00.000Z",
            "2026-08-30"
          )
        )
          .toBe("stale");
      }
    );


    it(
      "keeps a healthy source healthy when checked today",
      () => {
        expect(
          deriveEffectiveSourceStatus(
            "healthy",
            "2026-08-30T09:00:00.000Z",
            "2026-08-30"
          )
        )
          .toBe("healthy");
      }
    );


    it(
      "never overrides a non-healthy status, regardless of when checked",
      () => {
        expect(
          deriveEffectiveSourceStatus(
            "no-picks-today",
            "2020-01-01T00:00:00.000Z",
            "2026-08-30"
          )
        )
          .toBe("no-picks-today");

        expect(
          deriveEffectiveSourceStatus(
            "blocked",
            null,
            "2026-08-30"
          )
        )
          .toBe("blocked");
      }
    );


    it(
      "treats a never-checked source as stale, not healthy",
      () => {
        expect(
          deriveEffectiveSourceStatus(
            "healthy",
            null,
            "2026-08-30"
          )
        )
          .toBe("stale");
      }
    );
  }
);
