import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertSourceConfig
} from "../src/config/expert-acquisition";

import {
  directPageDateEvidence
} from "../src/experts/discovery";


describe(
  "expert source contracts",
  () => {
    it(
      "loads config-driven live contracts",
      () => {
        expect(
          expertSourceConfig(
            "horseturk"
          ).completenessProfile
        ).toBe(
          "coupon-explicit"
        );


        expect(
          expertSourceConfig(
            "yaris_dergisi"
          ).entryUrls
        ).toContain(
          "https://www.yarisdergisi.com/tag/yaris-tahminleri/"
        );


        expect(
          expertSourceConfig(
            "yaris_analizi"
          ).accessDeniedTerms
        ).toContain(
          "yetkiniz yok"
        );
      }
    );


    it(
      "does not confuse Istinye publication date with race date",
      () => {
        const stale =
          directPageDateEvidence(
            "istinye_ganyan",
            `
26 AĞUSTOS ÇARŞAMBA İSTANBUL ALTILI GANYAN TAHMİNLERİ
25.08.2026
26 AĞUSTOS ÇARŞAMBA ELAZIĞ ALTILI GANYAN TAHMİNLERİ
25.08.2026
`,
            "2026-08-25",
            [
              "Ankara",
              "Kocaeli"
            ]
          );


        expect(
          stale.ok
        ).toBe(false);


        const current =
          directPageDateEvidence(
            "istinye_ganyan",
            `
25 AĞUSTOS SALI KOCAELİ ALTILI GANYAN TAHMİNLERİ
25.08.2026
`,
            "2026-08-25",
            [
              "Ankara",
              "Kocaeli"
            ]
          );


        expect(
          current.ok
        ).toBe(true);
      }
    );
  }
);
