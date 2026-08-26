import {
  describe,
  expect,
  it
} from "vitest";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../src/config/expert-acquisition";


describe(
  "expert acquisition config v9",
  () => {
    it(
      "preserves verified static contracts",
      () => {
        expect(
          EXPERT_ACQUISITION_CONFIG
            .version
        ).toBe(
          9
        );


        expect(
          expertSourceConfig(
            "banko_tahminler"
          ).entryUrls[0]
        ).toBe(
          "https://www.bankotahminler.com/kategori/tahminler/"
        );


        expect(
          expertSourceConfig(
            "horseturk"
          ).explicitAnchorPolicy
        ).toBe(
          "allowlist"
        );


        expect(
          expertSourceConfig(
            "istinye_ganyan"
          ).archiveEntryUrls
        ).toEqual([
          "https://istinyeganyan.com/kategori/at-yarisi/"
        ]);
      }
    );


    it(
      "uses article AFA and dynamic Ganyan contracts",
      () => {
        expect(
          expertSourceConfig(
            "afa"
          ).mode
        ).toBe(
          "article"
        );


        expect(
          expertSourceConfig(
            "afa"
          ).promptProfile
        ).toBe(
          "afa"
        );


        expect(
          expertSourceConfig(
            "afa"
          ).canonicalOutputPolicy
        ).toBe(
          "strict"
        );


        expect(
          expertSourceConfig(
            "ganyan_canavari"
          ).entryUrls
        ).toEqual([
          "https://www.ganyancanavari.com.tr/site/yaris-programi.html"
        ]);
      }
    );
  }
);
