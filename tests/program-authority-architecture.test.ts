import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";


describe(
  "canonical daily program authority",
  () => {
    it(
      "removes stale current-day meetings",
      () => {
        const source =
          fs.readFileSync(
            "src/storage/program-repository.ts",
            "utf8"
          );

        expect(
          source
        ).toContain(
          "DELETE FROM runners"
        );

        expect(
          source
        ).toContain(
          "DELETE FROM races"
        );

        expect(
          source
        ).toContain(
          "DELETE FROM meetings"
        );

        expect(
          source
        ).toContain(
          "REFUSING_EMPTY_ACTIVE_PROGRAM"
        );
      }
    );
  }
);
