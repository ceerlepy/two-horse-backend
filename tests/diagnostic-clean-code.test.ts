import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";

describe(
  "diagnostic clean architecture",
  () => {
    it(
      "keeps diagnostics split by responsibility",
      () => {
        const facade =
          fs.readFileSync(
            "src/api/system-diagnostics.ts",
            "utf8"
          );

        const routes =
          fs.readFileSync(
            "src/api/diagnostics/routes.ts",
            "utf8"
          );

        const db =
          fs.readFileSync(
            "src/api/diagnostics/db.ts",
            "utf8"
          );

        const catalog =
          fs.readFileSync(
            "src/api/diagnostics/catalog.ts",
            "utf8"
          );

        expect(
          facade.split(/\r?\n/).length
        ).toBeLessThan(30);

        expect(routes)
          .toContain(
            "routeDiagnostics"
          );

        expect(db)
          .toContain(
            "databaseCounts"
          );

        expect(catalog)
          .toContain(
            "DIAGNOSTIC_ROUTES"
          );
      }
    );

    it(
      "provides deep drill-down diagnostics",
      () => {
        const source =
          fs.readFileSync(
            "src/api/diagnostics/routes.ts",
            "utf8"
          );

        for (
          const path of [
            "/api/debug/overview",
            "/api/debug/health/deep",
            "/api/debug/db/schema",
            "/api/debug/db/counts",
            "/api/debug/table",
            "/api/debug/card",
            "/api/debug/race",
            "/api/debug/runner",
            "/api/debug/data-quality",
            "/api/debug/invariants",
            "/api/debug/pipeline",
            "/api/debug/scoring-config"
          ]
        ) {
          expect(source)
            .toContain(path);
        }
      }
    );
  }
);
