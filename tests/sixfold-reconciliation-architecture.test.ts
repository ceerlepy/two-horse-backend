import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";


describe(
  "sixfold live window reconciliation",
  () => {
    it(
      "removes obsolete meeting windows",
      () => {
        const source =
          fs.readFileSync(
            "src/storage/program-repository.ts",
            "utf8"
          );

        expect(
          source
        ).toContain(
          "DELETE FROM sixfold_windows"
        );

        expect(
          source
        ).toContain(
          "city NOT IN"
        );

        expect(
          source
        ).not.toContain(
          "DELETE FROM sixfold_coupon_snapshots"
        );
      }
    );


    it(
      "removes obsolete windows inside an active meeting",
      () => {
        const source =
          fs.readFileSync(
            "src/coupons/repository.ts",
            "utf8"
          );

        expect(
          source
        ).toContain(
          "DELETE FROM sixfold_windows"
        );

        expect(
          source
        ).toContain(
          "sixfold_number"
        );

        expect(
          source
        ).toContain(
          "NOT IN"
        );
      }
    );
  }
);
