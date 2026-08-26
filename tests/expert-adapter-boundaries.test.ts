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
      "keeps static article sources browser-free",
      () => {
        for (
          const source of
          [
            "liderform",
            "horseturk",
            "yaris_analizi"
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
      "keeps dynamic runtime sources browser-owned",
      () => {
        expect(
          typeof expertAdapterFor(
            "ganyan_canavari"
          ).acquireHtml
        ).toBe(
          "function"
        );


        expect(
          typeof expertAdapterFor(
            "afa"
          ).acquireHtml
        ).toBe(
          "function"
        );
      }
    );
  }
);
