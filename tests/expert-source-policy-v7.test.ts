import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertSourceConfig
} from "../src/config/expert-acquisition";


describe(
  "expert source policy v7",
  () => {
    it(
      "keeps source-specific resilience in config",
      () => {
        expect(
          expertSourceConfig(
            "horseturk"
          ).explicitAnchorPolicy
        ).toBe(
          "allowlist"
        );


        expect(
          expertSourceConfig(
            "yaris_dergisi"
          ).feedUrls?.length
        ).toBeGreaterThan(0);


        expect(
          expertSourceConfig(
            "banko_tahminler"
          ).feedUrls?.length
        ).toBeGreaterThan(0);


        expect(
          expertSourceConfig(
            "istinye_ganyan"
          ).archivePolicy
        ).toBe(
          "historical-only"
        );


        expect(
          expertSourceConfig(
            "ganyan_canavari"
          ).structuredResolver
            ?.kind
        ).toBe(
          "ganyan-canavari"
        );


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
