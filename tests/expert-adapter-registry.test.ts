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
      "uses generic adapter for unknown future sources",
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


    it(
      "isolates dynamic browser acquisition",
      () => {
        const ganyan =
          expertAdapterFor(
            "ganyan_canavari"
          );

        const afa =
          expertAdapterFor(
            "afa"
          );


        expect(
          typeof ganyan.acquireHtml
        ).toBe(
          "function"
        );


        expect(
          ganyan.ownsAcquisition?.(
            "https://www.ganyancanavari.com.tr/site/galoplar-ozet.html"
          )
        ).toBe(
          true
        );


        expect(
          ganyan.ownsAcquisition?.(
            "https://www.ganyancanavari.com.tr/haberler/example.html"
          )
        ).toBe(
          false
        );


        expect(
          typeof afa.acquireHtml
        ).toBe(
          "function"
        );


        expect(
          afa.ownsAcquisition?.(
            "https://atlarafisildayanadam.com/terminal"
          )
        ).toBe(
          true
        );
      }
    );
  }
);
