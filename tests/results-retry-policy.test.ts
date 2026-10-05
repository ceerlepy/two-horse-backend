import {
  describe,
  expect,
  it
} from "vitest";

import {
  ingestOfficialResultsDue
} from "../src/results/runtime";


describe(
  "official result retry policy",
  () => {
    it(
      "compares ISO timestamps with ISO bounds and limits the batch",
      async () => {
        let boundSql = "";
        let bound: unknown[] = [];

        const env: any = {
          DB: {
            prepare(sql: string) {
              boundSql = sql;

              return {
                bind(...values: unknown[]) {
                  bound = values;

                  return {
                    async all() {
                      return { results: [] };
                    }
                  };
                }
              };
            }
          }
        };

        await ingestOfficialResultsDue(env);

        expect(boundSql).not.toContain("datetime(");

        const [
          oldestDate,
          retryBound,
          finishedBound,
          limit
        ] = bound;

        expect(oldestDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(retryBound).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(finishedBound).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(limit).toBe(2);
      }
    );
  }
);
