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
  "expert acquisition config v10",
  () => {
    it(
      "preserves verified source contracts",
      () => {
        expect(
          EXPERT_ACQUISITION_CONFIG.version
        ).toBe(10);

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
      "uses public Ganyan articles and dynamic AFA terminal",
      () => {
        expect(
          expertSourceConfig(
            "ganyan_canavari"
          ).mode
        ).toBe("article");

        expect(
          expertSourceConfig(
            "ganyan_canavari"
          ).entryUrls
        ).toEqual([
          "https://www.ganyancanavari.com.tr/haberler/"
        ]);

        expect(
          expertSourceConfig(
            "afa"
          ).entryUrls
        ).toEqual([
          "https://atlarafisildayanadam.com/terminal"
        ]);

        expect(
          expertSourceConfig(
            "afa"
          ).canonicalOutputPolicy
        ).toBe("strict");
      }
    );
  }
);
