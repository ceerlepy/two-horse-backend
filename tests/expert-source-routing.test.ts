import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertLandingUrls,
  expertUrlCandidates
} from "../src/experts/source-urls";

import {
  normalizeExpertFingerprintMaterial
} from "../src/experts/fingerprint";

import type {
  ExpertSource
} from "../src/experts/source-types";


function source():
  ExpertSource {
  return {
    source_key:
      "liderform",

    source_name:
      "Liderform",

    homepage_url:
      "https://liderform.com.tr/",

    last_working_url:
      "https://liderform.com.tr/haberler/today.html",

    content_hash:
      null,

    last_checked_at:
      null,

    last_success_at:
      null,

    source_type:
      "expert",

    base_weight:
      1
  };
}


describe(
  "expert source routing and fingerprinting",
  () => {
    it(
      "keeps dynamic daily article separate from durable landing URLs",
      () => {
        const item =
          source();


        const landings =
          expertLandingUrls(
            item
          );


        expect(
          landings
        ).toContain(
          "https://liderform.com.tr/"
        );


        expect(
          landings
        ).not.toContain(
          item.last_working_url
        );


        expect(
          expertUrlCandidates(
            item
          )[0]
        ).toBe(
          item.last_working_url
        );
      }
    );


    it(
      "ignores script churn for article fingerprints",
      () => {
        const first =
          normalizeExpertFingerprintMaterial(
            `
              <body>
                <script>random=1</script>
                <p>
                  PRANDELLO güçlü adaydır
                </p>
              </body>
            `,
            "https://example.com/article",
            false
          );


        const second =
          normalizeExpertFingerprintMaterial(
            `
              <body>
                <script>random=999999</script>
                <p>
                  PRANDELLO güçlü adaydır
                </p>
              </body>
            `,
            "https://example.com/article",
            false
          );


        expect(first)
          .toBe(second);
      }
    );


    it(
      "detects changed href destinations on stable landing pages",
      () => {
        const first =
          normalizeExpertFingerprintMaterial(
            `
              <body>
                <a href="/haberler/a.html">
                  Bugünkü Analiz
                </a>
              </body>
            `,
            "https://example.com/",
            true
          );


        const second =
          normalizeExpertFingerprintMaterial(
            `
              <body>
                <a href="/haberler/b.html">
                  Bugünkü Analiz
                </a>
              </body>
            `,
            "https://example.com/",
            true
          );


        expect(first)
          .not.toBe(second);
      }
    );
  }
);
