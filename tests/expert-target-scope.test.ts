import {
  describe,
  expect,
  it
} from "vitest";

import {
  cityFromTarget,
  cityScopedTarget,
  externalTargetUrl,
  targetCitiesForUrl
} from "../src/experts/adapters/target-scope";


describe(
  "expert target scope",
  () => {
    it(
      "keeps synthetic city scope out of external URL",
      () => {
        const target =
          cityScopedTarget(
            "https://example.com/program",
            "Kocaeli"
          );


        expect(
          cityFromTarget(
            target
          )
        ).toBe(
          "Kocaeli"
        );


        expect(
          externalTargetUrl(
            target
          )
        ).toBe(
          "https://example.com/program"
        );
      }
    );


    it(
      "derives article city directly from permalink",
      () => {
        expect(
          targetCitiesForUrl(
            "https://example.com/25-agustos-2026-ankara-tahminleri/",
            [
              "Ankara",
              "Kocaeli"
            ]
          )
        ).toEqual([
          "Ankara"
        ]);
      }
    );
  }
);
