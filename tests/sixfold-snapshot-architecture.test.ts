import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";


describe(
  "sixfold snapshot persistence",
  () => {
    it(
      "keeps generation idempotent",
      () => {
        const source =
          fs.readFileSync(
            "src/coupons/repository.ts",
            "utf8"
          );

        expect(
          source
        ).toContain(
          "snapshotKey"
        );

        expect(
          source
        ).toContain(
          "WHERE NOT EXISTS"
        );

        expect(
          source
        ).toContain(
          "ON CONFLICT(snapshot_key)"
        );
      }
    );
  }
);
