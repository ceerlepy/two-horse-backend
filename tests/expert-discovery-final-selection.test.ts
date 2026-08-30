import {
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

import {
  EXPERT_ACQUISITION_CONFIG
} from "../src/config/expert-acquisition";

import {
  candidateEvidence
} from "../src/experts/discovery";


describe(
  "expert discovery final selection architecture",
  () => {
    it(
      "uses progressive structural acquisition",
      () => {
        expect(
          EXPERT_ACQUISITION_CONFIG
            .discovery
            .acquisitionOrder
        ).toEqual([
          "cf-scrape",
          "cf-links",
          "cf-content",
          "http",
          "wp-json"
        ]);
      }
    );


    it(
      "makes race date a hard candidate gate",
      () => {
        const stale =
          candidateEvidence(
            "horseturk",
            "https://www.horseturk.com/altili-ganyan-tahmin-kocaeli-20-agustos-2026/",
            "Kocaeli altılı ganyan tahmin",
            "2026-08-25",
            ["Kocaeli"]
          );


        const current =
          candidateEvidence(
            "horseturk",
            "https://www.horseturk.com/altili-ganyan-tahmin-kocaeli-25-agustos-2026/",
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

        expect(
          current.hasDate
        ).toBe(true);

        expect(
          current.deterministic
        ).toBe(true);
      }
    );


    it(
      "never uses Browser semantic JSON or deterministic URL union",
      () => {
        const source =
          readFileSync(
            "src/experts/discovery.ts",
            "utf8"
          );


        expect(source)
          .not
          .toContain(
            "extractSemanticJsonFromHtml"
          );


        expect(source)
          .toContain(
            "selectExpertCandidateUrlsWithWorkersAi"
          );


        expect(source)
          .not
          .toContain(
            "...deterministic"
          );


        expect(source)
          .toContain(
            "FINAL URL decision is AI-only"
          );
      }
    );
  }
);
