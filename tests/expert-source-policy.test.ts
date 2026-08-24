import {
  describe,
  expect,
  it
} from "vitest";

import {
  isUsableCandidate
} from "../src/experts/discovery";

import {
  expertRequiresDiscoveredArticle,
  isAllowedDiscoveredArticleUrl
} from "../src/experts/source-policy";


describe(
  "expert source publishing policy",
  () => {
    it(
      "hard rejects utility discovery candidates",
      () => {
        const landing =
          "https://liderform.com.tr/";


        expect(
          isUsableCandidate(
            landing,
            "https://liderform.com.tr/kayitlar/2026-08-24"
          )
        )
          .toBe(
            false
          );


        expect(
          isUsableCandidate(
            landing,
            "https://liderform.com.tr/program/performans"
          )
        )
          .toBe(
            false
          );


        expect(
          isUsableCandidate(
            landing,
            "https://liderform.com.tr/sonuclar"
          )
        )
          .toBe(
            false
          );
      }
    );


    it(
      "accepts Liderform article details but rejects category and utility pages",
      () => {
        expect(
          isAllowedDiscoveredArticleUrl(
            "liderform",
            "https://liderform.com.tr/haberler/20266-pazartesi-bursada-6910-ve-elazigda-368-kosularin-analizi.html"
          )
        )
          .toBe(
            true
          );


        expect(
          isAllowedDiscoveredArticleUrl(
            "liderform",
            "https://liderform.com.tr/haberler/analizler"
          )
        )
          .toBe(
            false
          );


        expect(
          isAllowedDiscoveredArticleUrl(
            "liderform",
            "https://liderform.com.tr/kayitlar/2026-08-24"
          )
        )
          .toBe(
            false
          );
      }
    );


    it(
      "requires a separate current article for Liderform",
      () => {
        expect(
          expertRequiresDiscoveredArticle(
            "liderform"
          )
        )
          .toBe(
            true
          );


        expect(
          expertRequiresDiscoveredArticle(
            "istinye_ganyan"
          )
        )
          .toBe(
            false
          );
      }
    );
  }
);
