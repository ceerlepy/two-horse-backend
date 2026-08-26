import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertAdapterFor
} from "../src/experts/adapters/registry";


describe(
  "expert adapter boundaries",
  () => {
    it(
      "keeps article sources on normal acquisition",
      () => {
        for (
          const source of
          [
            "liderform",
            "horseturk",
            "yaris_analizi",
            "afa"
          ]
        ) {
          expect(
            expertAdapterFor(
              source
            ).acquireHtml
          ).toBeUndefined();
        }
      }
    );


    it(
      "keeps only Ganyan runtime state browser-owned",
      () => {
        expect(
          typeof expertAdapterFor(
            "ganyan_canavari"
          ).acquireHtml
        ).toBe(
          "function"
        );
      }
    );
  }
);
