import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertAdapterFor
} from "../src/experts/adapters/registry";

describe(
  "part 5 resilient article adapter boundaries",
  () => {
    it(
      "enables browser fallback only for failing article sources",
      () => {
        for (
          const source of [
            "banko_tahminler",
            "yaris_dergisi",
            "istinye_ganyan"
          ]
        ) {
          expect(
            typeof expertAdapterFor(source).acquireHtml
          ).toBe("function");
        }
      }
    );

    it(
      "does not change verified static article sources",
      () => {
        for (
          const source of [
            "liderform",
            "horseturk",
            "yaris_analizi"
          ]
        ) {
          expect(
            expertAdapterFor(source).acquireHtml
          ).toBeUndefined();
        }
      }
    );
  }
);
