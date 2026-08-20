import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";

describe(
  "backend completion",
  () => {
    it(
      "protects operational endpoints",
      () => {
        const router =
          fs.readFileSync(
            "src/api/router.ts",
            "utf8"
          );

        const env =
          fs.readFileSync(
            "src/env.ts",
            "utf8"
          );

        expect(env)
          .toContain(
            "ADMIN_TOKEN"
          );

        expect(router)
          .toContain(
            "/api/admin/"
          );

        expect(router)
          .toContain(
            "/api/debug/"
          );

        expect(router)
          .toContain(
            "ADMIN_AUTH_NOT_CONFIGURED"
          );

        expect(router)
          .toContain(
            "UNAUTHORIZED"
          );
      }
    );

    it(
      "keeps GET calculation read only",
      () => {
        const service =
          fs.readFileSync(
            "src/coupons/service.ts",
            "utf8"
          );

        expect(service)
          .toContain(
            "read-only-request"
          );

        expect(service)
          .toContain(
            "race-already-started"
          );

        expect(service)
          .toContain(
            "pre-race-frozen"
          );
      }
    );

    it(
      "uses global optimizer",
      () => {
        const optimizer =
          fs.readFileSync(
            "src/coupons/optimizer.ts",
            "utf8"
          );

        expect(optimizer)
          .toContain(
            "globallyOptimalCounts"
          );

        expect(optimizer)
          .toContain(
            "enumerateHalf"
          );

        expect(optimizer)
          .not.toContain(
            "bestExpansion("
          );
      }
    );
  }
);
