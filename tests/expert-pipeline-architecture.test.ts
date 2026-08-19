import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertExtractionPrompt
} from "../src/experts/prompt";

import {
  mapLimit
} from "../src/experts/concurrency";

describe(
  "expert pipeline architecture",
  () => {
    it(
      "keeps extraction prompt semantic labels",
      () => {
        const prompt =
          expertExtractionPrompt(
            "Test Source"
          );

        expect(prompt)
          .toContain(
            "isBanko=true"
          );

        expect(prompt)
          .toContain(
            "isRival=true"
          );

        expect(prompt)
          .toContain(
            "isSurprise=true"
          );

        expect(prompt)
          .toContain(
            "isAvoid=true"
          );
      }
    );

    it(
      "preserves output order under bounded concurrency",
      async () => {
        const values =
          await mapLimit(
            [1, 2, 3, 4],
            2,

            async value =>
              value * 10
          );

        expect(values)
          .toEqual(
            [10, 20, 30, 40]
          );
      }
    );
  }
);
