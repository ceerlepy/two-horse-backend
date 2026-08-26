import {
  describe,
  expect,
  it
} from "vitest";

import {
  candidateEvidence
} from "../src/experts/discovery";


describe(
  "expert URL identity evidence",
  () => {
    it(
      "understands compact Yaris Dergisi dates",
      () => {
        const value =
          candidateEvidence(
            "yaris_dergisi",
            "https://www.yarisdergisi.com/cix-life-bankom-kocaeli25826-cetin-gokduman/",
            "",
            "2026-08-25",
            ["Ankara","Kocaeli"]
          );

        expect(value.hasDate).toBe(true);
        expect(value.hasCity).toBe(true);
        expect(
          value.hasPredictionLanguage
        ).toBe(true);
      }
    );

    it(
      "understands Banko yearless slug dates",
      () => {
        const value =
          candidateEvidence(
            "banko_tahminler",
            "https://www.bankotahminler.com/tahminler/25-agustos-kocaeli-at-yarisi-tahminleri-toroman37/",
            "",
            "2026-08-25",
            ["Ankara","Kocaeli"]
          );

        expect(value.hasDate).toBe(true);
        expect(value.hasCity).toBe(true);
        expect(
          value.hasPredictionLanguage
        ).toBe(true);
      }
    );

    it(
      "decodes percent-encoded Istinye slugs",
      () => {
        const value =
          candidateEvidence(
            "istinye_ganyan",
            "https://istinyeganyan.com/25-a%C4%9Fustos-sali-kocaeli%CC%87-altili-ganyan-tahmi%CC%87nleri%CC%87/",
            "",
            "2026-08-25",
            ["Ankara","Kocaeli"]
          );

        expect(value.hasDate).toBe(true);
        expect(value.hasCity).toBe(true);
        expect(
          value.hasPredictionLanguage
        ).toBe(true);
      }
    );
  }
);
