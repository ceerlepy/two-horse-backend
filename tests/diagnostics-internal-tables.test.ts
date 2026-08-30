import {
  describe,
  expect,
  it
} from "vitest";

import {
  filterAppTableNames
} from "../src/api/diagnostics/db";


describe(
  "diagnostics table filtering (Part 12)",
  () => {
    it(
      "excludes D1/Cloudflare-managed bookkeeping tables",
      () => {
        const result =
          filterAppTableNames([
            "_cf_KV",
            "d1_migrations",
            "runners",
            "expert_predictions"
          ]);

        expect(result)
          .toEqual([
            "runners",
            "expert_predictions"
          ]);
      }
    );


    it(
      "still rejects invalid identifiers",
      () => {
        expect(
          filterAppTableNames([
            "runners; DROP TABLE runners"
          ])
        ).toEqual([]);
      }
    );


    it(
      "keeps every real application table untouched",
      () => {
        const appTables = [
          "meetings",
          "races",
          "runners",
          "source_registry",
          "main_source_registry",
          "sixfold_coupon_snapshots"
        ];

        expect(
          filterAppTableNames(appTables)
        ).toEqual(appTables);
      }
    );
  }
);
