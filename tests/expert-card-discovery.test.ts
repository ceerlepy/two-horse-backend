import {
  describe,
  expect,
  it
} from "vitest";

import {
  extractAnchorCandidates
} from "../src/experts/adapters/card-discovery";


describe(
  "bounded source anchor discovery",
  () => {
    it(
      "rejects stale Yaris Dergisi sibling",
      () => {
        const current =
          "https://www.yarisdergisi.com/cix-life-bankom-kocaeli25826-cetin-gokduman/";

        const stale =
          "https://www.yarisdergisi.com/eski-bankom-kocaeli18826/";


        const urls =
          extractAnchorCandidates({
            sourceKey:
              "yaris_dergisi",

            landingUrl:
              "https://www.yarisdergisi.com/",

            raceDate:
              "2026-08-25",

            cities:[
              "Ankara",
              "Kocaeli"
            ],

            anchors:[
              {
                href:
                  current,

                text:
                  "25 Ağustos 2026 CIX LIFE Bankom Kocaeli"
              },
              {
                href:
                  stale,

                text:
                  "18 Ağustos 2026 Eski Bankom Kocaeli"
              }
            ]
          })
            .map(
              value =>
                value.url
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
      "accepts Banko target URL",
      () => {
        const url =
          "https://www.bankotahminler.com/tahminler/25-agustos-ankara-tahminleri-stalingrad/";


        const result =
          extractAnchorCandidates({
            sourceKey:
              "banko_tahminler",

            landingUrl:
              "https://www.bankotahminler.com/",

            raceDate:
              "2026-08-25",

            cities:[
              "Ankara",
              "Kocaeli"
            ],

            anchors:[
              {
                href:
                  url,

                text:
                  "25 Ağustos Ankara Tahminleri STALINGRAD"
              }
            ]
          });


        expect(
          result.map(
            value =>
              value.url
          )
        ).toContain(
          url
        );
      }
    );


    it(
      "accepts Istinye historical target URL",
      () => {
        const url =
          "https://istinyeganyan.com/25-agustos-sali-ankara-altili-ganyan-tahminleri/";


        const result =
          extractAnchorCandidates({
            sourceKey:
              "istinye_ganyan",

            landingUrl:
              "https://istinyeganyan.com/kategori/at-yarisi/",

            raceDate:
              "2026-08-25",

            cities:[
              "Ankara",
              "Kocaeli"
            ],

            anchors:[
              {
                href:
                  url,

                text:
                  "25 Ağustos Salı Ankara Altılı Ganyan Tahminleri"
              }
            ]
          });


        expect(
          result.map(
            value =>
              value.url
          )
        ).toContain(
          url
        );
      }
    );
  }
);
