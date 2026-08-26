import {
  describe,
  expect,
  it
} from "vitest";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../src/config/expert-acquisition";

import {
  buildExpertRaceDateTokens
} from "../src/experts/date-evidence";

import {
  isAllowedDiscoveredArticleUrl,
  preferredArticlePathScore
} from "../src/experts/source-policy";


describe(
  "expert acquisition config",
  () => {

    it(
      "keeps operational URL policy outside source code",
      () => {
        expect(
          EXPERT_ACQUISITION_CONFIG
            .discovery
            .excludedPathPrefixes
        )
          .toContain(
            "/login"
          );


        expect(
          EXPERT_ACQUISITION_CONFIG
            .discovery
            .acquisitionOrder
        )
          .toEqual([
            "cf-scrape",
            "cf-links",
            "cf-content",
            "http"
          ]);
      }
    );


    it(
      "loads verified source entries from config",
      () => {
        expect(
          expertSourceConfig(
            "banko_tahminler"
          )
            .entryUrls[0]
        )
          .toBe(
            "https://www.bankotahminler.com/kategori/tahminler/"
          );


        expect(
          expertSourceConfig(
            "horseturk"
          )
            .entryUrls[0]
        )
          .toBe(
            "https://www.horseturk.com/cat/at-yarisi-tahminleri/"
          );


        expect(
          expertSourceConfig(
            "afa"
          )
            .entryUrls[0]
        )
          .toBe(
            "https://atlarafisildayanadam.com/"
          );
      }
    );


    it(
      "uses Intl-based Turkish date evidence",
      () => {
        const tokens =
          buildExpertRaceDateTokens(
            "2026-08-25"
          );


        expect(tokens)
          .toContain(
            "25 agustos 2026"
          );


        expect(tokens)
          .toContain(
            "2026 08 25"
          );
      }
    );


    it(
      "treats article path patterns as preference rather than hard truth",
      () => {
        expect(
          preferredArticlePathScore(
            "banko_tahminler",
            "https://www.bankotahminler.com/tahminler/current/"
          )
        )
          .toBeGreaterThan(
            0
          );


        expect(
          isAllowedDiscoveredArticleUrl(
            "banko_tahminler",
            "https://www.bankotahminler.com/yazar/stalingrad/current/"
          )
        )
          .toBe(
            true
          );
      }
    );
  }
);
