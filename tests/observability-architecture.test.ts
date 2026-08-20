import {
  describe,
  expect,
  it
} from "vitest";

import fs from "node:fs";

describe(
  "observability architecture",
  () => {
    it(
      "has structured log levels",
      () => {
        const source =
          fs.readFileSync(
            "src/observability/logger.ts",
            "utf8"
          );

        expect(
          source
        ).toContain(
          '"debug"'
        );

        expect(
          source
        ).toContain(
          '"info"'
        );

        expect(
          source
        ).toContain(
          '"warn"'
        );

        expect(
          source
        ).toContain(
          '"error"'
        );

        expect(
          source
        ).toContain(
          "[redacted]"
        );
      }
    );
  }
);
