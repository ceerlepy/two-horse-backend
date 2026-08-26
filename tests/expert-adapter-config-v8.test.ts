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
  "expert acquisition config v8",
  () => {
    it(
      "contains adapter-era source contracts",
      () => {
        expect(
          EXPERT_ACQUISITION_CONFIG
            .version
        ).toBe(
          8
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
          ).archivePolicy
        ).toBe(
          "historical-only"
        );


        expect(
          expertSourceConfig(
            "istinye_ganyan"
          ).archiveEntryUrls
        ).toEqual([
          "https://istinyeganyan.com/kategori/at-yarisi/"
        ]);


        expect(
          expertSourceConfig(
            "banko_tahminler"
          ).entryUrls
        ).toContain(
          "https://www.bankotahminler.com/mobil/"
        );


        expect(
          (
            expertSourceConfig(
              "ganyan_canavari"
            ) as any
          ).structuredResolver
        ).toBeUndefined();


        expect(
          expertSourceConfig(
            "afa"
          ).canonicalOutputPolicy
        ).toBe(
          "repair-drop-ai-noise"
        );
      }
    );
  }
);
