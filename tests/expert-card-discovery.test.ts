import {
  describe,
  expect,
  it
} from "vitest";

import {
  extractSourceCardCandidatesFromHtml
} from "../src/experts/adapters/card-discovery";


describe(
  "source-local card discovery",
  () => {
    it(
      "keeps current Yaris Dergisi article and rejects stale sibling",
      () => {
        const current =
          "https://www.yarisdergisi.com/cix-life-bankom-kocaeli25826-cetin-gokduman/";

        const stale =
          "https://www.yarisdergisi.com/eski-bankom-kocaeli18826/";


        const html = `
          <article>
            <a href="${current}">
              CIX LIFE Bankom Kocaeli 25 Ağustos 2026
            </a>
          </article>

          <article>
            <a href="${stale}">
              Eski Bankom Kocaeli 18 Ağustos 2026
            </a>
          </article>
        `;


        const urls =
          extractSourceCardCandidatesFromHtml({
            sourceKey:
              "yaris_dergisi",

            landingUrl:
              "https://www.yarisdergisi.com/tag/yaris-tahminleri/",

            html,

            raceDate:
              "2026-08-25",

            cities:[
              "Ankara",
              "Kocaeli"
            ],

            selectors:[
              "article"
            ]
          })
            .map(
              item =>
                item.url
            );


        expect(
          urls
        ).toContain(
          current
        );


        expect(
          urls
        ).not.toContain(
          stale
        );
      }
    );


    it(
      "finds rendered Banko tahmin anchor",
      () => {
        const current =
          "https://www.bankotahminler.com/tahminler/25-agustos-ankara-tahminleri-stalingrad/";


        const html = `
          <article>
            <a href="${current}">
              25 Ağustos Ankara Tahminleri STALINGRAD
            </a>
          </article>
        `;


        const urls =
          extractSourceCardCandidatesFromHtml({
            sourceKey:
              "banko_tahminler",

            landingUrl:
              "https://www.bankotahminler.com/",

            html,

            raceDate:
              "2026-08-25",

            cities:[
              "Ankara",
              "Kocaeli"
            ],

            selectors:[
              "article",
              "a[href*='/tahminler/']"
            ]
          })
            .map(
              item =>
                item.url
            );


        expect(
          urls
        ).toContain(
          current
        );
      }
    );
  }
);
