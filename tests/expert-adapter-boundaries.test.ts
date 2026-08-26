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
      "keeps stable sources on normal acquisition",
      () => {
        expect(
          expertAdapterFor(
            "liderform"
          ).acquireHtml
        ).toBeUndefined();


        expect(
          expertAdapterFor(
            "horseturk"
          ).acquireHtml
        ).toBeUndefined();


        expect(
          expertAdapterFor(
            "yaris_analizi"
          ).acquireHtml
        ).toBeUndefined();
      }
    );


    it(
      "keeps dynamic sites source-owned",
      () => {
        expect(
          typeof expertAdapterFor(
            "afa"
          ).acquireHtml
        ).toBe(
          "function"
        );


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
