import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";

describe(
  "debug API architecture",
  () => {
    it(
      "has granular diagnostics",
      () => {
        const source =
          fs.readFileSync(
            "src/api/system-diagnostics.ts",
            "utf8"
          );

        for (
          const path of [
            "/api/debug/health/deep",
            "/api/debug/invariants",
            "/api/debug/card",
            "/api/debug/race",
            "/api/debug/runner",
            "/api/debug/db/schema",
            "/api/debug/db/counts",
            "/api/debug/scoring-config"
          ]
        ) {
          expect(
            source
          ).toContain(
            path
          );
        }
      }
    );
  }
);
