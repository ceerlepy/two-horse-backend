import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertAdapterFor
} from "../src/experts/adapters/registry";


describe(
  "expert adapter registry",
  () => {
    it(
      "owns all eight expert sources",
      () => {
        const keys = [
          "liderform",
          "yaris_dergisi",
          "banko_tahminler",
          "horseturk",
          "yaris_analizi",
          "istinye_ganyan",
          "ganyan_canavari",
          "afa"
        ];


        for (
          const key of
          keys
        ) {
          expect(
            expertAdapterFor(
              key
            ).sourceKey
          ).toBe(
            key
          );
        }
      }
    );


    it(
      "keeps unknown future sources generic",
      () => {
        expect(
          expertAdapterFor(
            "future_source"
          ).sourceKey
        ).toBe(
          "*"
        );
      }
    );
  }
);
