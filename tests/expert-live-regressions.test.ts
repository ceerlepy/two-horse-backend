import {
  describe,
  expect,
  it
} from "vitest";

import {
  candidateEvidence
} from "../src/experts/discovery";

import {
  normalizeExpertHorseName
} from "../src/experts/validator";

import {
  preferredArticlePathScore
} from "../src/experts/source-policy";

import {
  buildExpertRaceDateTokens
} from "../src/experts/date-evidence";

import {
  normalizeExpertSearchText
} from "../src/experts/text-normalization";


describe(
  "expert live-source regressions",
  () => {
    it(
      "does not let path score replace current race date",
      () => {
        const stale =
          candidateEvidence(
            "horseturk",
            "https://www.horseturk.com/altili-ganyan-tahmin-kocaeli-20-agustos-2026/",
            "Kocaeli altılı ganyan tahmin",
            "2026-08-25",
            ["Kocaeli"]
          );


        expect(
          stale.hasDate
        ).toBe(false);

        expect(
          stale.deterministic
        ).toBe(false);


        const current =
          candidateEvidence(
            "horseturk",
            "https://www.horseturk.com/altili-ganyan-tahmin-kocaeli-25-agustos-2026/",
            "Kocaeli altılı ganyan tahmin",
            "2026-08-25",
            ["Kocaeli"]
          );


        expect(
          current.hasDate
        ).toBe(true);

        expect(
          current.deterministic
        ).toBe(true);
      }
    );


    it(
      "rejects Yaris Dergisi Kombine Bahis candidates",
      () => {
        const evidence =
          candidateEvidence(
            "yaris_dergisi",
            "https://www.yarisdergisi.com/atahan-zilciogludan-ankarada-kombine-bahis-tercihleri25826/",
            "25 Ağustos 2026 Ankara Kombine Bahis Tahminler",
            "2026-08-25",
            ["Ankara"]
          );


        expect(
          evidence.hasNegativeLanguage
        ).toBe(true);

        expect(
          evidence.deterministic
        ).toBe(false);
      }
    );


    it(
      "normalizes canonical TJK draw suffix",
      () => {
        expect(
          normalizeExpertHorseName(
            "BIG HONEY (3)"
          )
        ).toBe(
          normalizeExpertHorseName(
            "BIG HONEY"
          )
        );
      }
    );


    it(
      "supports configured yearless Banko Tahminler slugs",
      () => {
        const material =
          normalizeExpertSearchText(
            "https://www.bankotahminler.com/tahminler/25-agustos-ankara-tahminleri-stalingrad/"
          );


        const tokens =
          buildExpertRaceDateTokens(
            "2026-08-25",
            {
              allowYearless:true
            }
          );


        expect(
          tokens.some(
            token =>
              material.includes(
                token
              )
          )
        ).toBe(true);
      }
    );


    it(
      "matches nested Yaris Analizi article path",
      () => {
        expect(
          preferredArticlePathScore(
            "yaris_analizi",
            "https://www.yarisanalizi.com/yazarlar/yazilari/9/guncel-at-yarisi-tahminleri/5674/25-08-2026-ANKARA-ve-KOCAELI-ALTILI-GANYAN-TAHMINLERI.html"
          )
        ).toBeGreaterThan(0);
      }
    );
  }
);
