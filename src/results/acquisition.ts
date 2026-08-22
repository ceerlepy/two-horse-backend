import * as cheerio from "cheerio";

import type {
  Env
} from "../env";

import {
  acquireAndParse
} from "../acquisition/deterministic";

import {
  parseOfficialResultsHtml
} from "./parser";

import {
  validateOfficialResults
} from "./validator";

import {
  extractOfficialResultsSemantic
} from "./semantic";

import {
  buildOfficialResultsCityUrl,
  buildOfficialResultsPageUrl
} from "./url";

import type {
  OfficialMeetingResults
} from "./types";


export interface AcquiredOfficialResults {
  value: OfficialMeetingResults;
  method: string;
  diagnostics: unknown;
}


function normalizedCity(
  value: string
): string {
  return value
    .trim()
    .toLocaleLowerCase(
      "tr-TR"
    );
}


/*
 * Stable domestic TJK race-center identifiers.
 *
 * These are part of TJK's public result URL identity.
 * They should be preferred over scraping a selector
 * link from the outer page on every request.
 */
const KNOWN_TJK_CITY_IDS:
  Record<string, string> = {
    "ankara": "5",
    "bursa": "4",
    "elazığ": "7",
    "elazig": "7",
    "kocaeli": "9"
  };


function knownCityId(
  city: string
): string | null {
  const normalized =
    normalizedCity(city);

  return (
    KNOWN_TJK_CITY_IDS[
      normalized
    ] ?? null
  );
}


function extractCityId(
  html: string,
  city: string
): string | null {
  const $ =
    cheerio.load(html);

  const wanted =
    normalizedCity(city);

  let found:
    string | null =
    null;

  $("a[href]").each(
    (_, element) => {
      if (found) {
        return;
      }

      const anchor =
        $(element);

      const href =
        anchor.attr(
          "href"
        );

      if (!href) {
        return;
      }

      if (
        !href.includes(
          "GunlukYarisSonuclari"
        )
      ) {
        return;
      }

      let parsed:
        URL;

      try {
        parsed =
          new URL(
            href,
            "https://www.tjk.org"
          );
      } catch {
        return;
      }

      const linkCity =
        parsed.searchParams.get(
          "SehirAdi"
        );

      const cityId =
        parsed.searchParams.get(
          "SehirId"
        );

      if (
        !linkCity ||
        !cityId
      ) {
        return;
      }

      if (
        normalizedCity(
          linkCity
        ) !== wanted
      ) {
        return;
      }

      found =
        cityId;
    }
  );

  return found;
}


async function discoverCityResultUrl(
  input: {
    raceDate: string;
    city: string;
  }
): Promise<{
  pageUrl: string;
  cityUrl: string;
  cityId: string | null;
  discoveryMethod:
    | "known-city-id"
    | "page-city-id"
    | "city-name-direct";
}> {
  const pageUrl =
    buildOfficialResultsPageUrl(
      input.raceDate,
      input.city
    );

  /*
   * PRIMARY PATH
   *
   * Use stable TJK city identity when known.
   *
   * This removes our previous dependence on the outer
   * result page exposing a city selector link in a
   * particular HTML shape.
   */
  const canonicalCityId =
    knownCityId(
      input.city
    );

  if (canonicalCityId) {
    return {
      pageUrl,

      cityId:
        canonicalCityId,

      discoveryMethod:
        "known-city-id",

      cityUrl:
        buildOfficialResultsCityUrl(
          input.raceDate,
          input.city,
          canonicalCityId
        )
    };
  }

  /*
   * SECONDARY PATH
   *
   * For cities not yet in the canonical registry,
   * attempt to discover SehirId dynamically.
   */
  try {
    const response =
      await fetch(
        pageUrl,
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 TwoHorse/1.0",

            accept:
              "text/html,application/xhtml+xml"
          }
        }
      );

    if (response.ok) {
      const html =
        await response.text();

      const discoveredCityId =
        extractCityId(
          html,
          input.city
        );

      if (discoveredCityId) {
        return {
          pageUrl,

          cityId:
            discoveredCityId,

          discoveryMethod:
            "page-city-id",

          cityUrl:
            buildOfficialResultsCityUrl(
              input.raceDate,
              input.city,
              discoveredCityId
            )
        };
      }
    }
  } catch (error) {
    console.warn(
      "[RESULTS] dynamic city-id discovery failed",
      {
        raceDate:
          input.raceDate,

        city:
          input.city,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      }
    );
  }

  /*
   * LAST RESORT
   *
   * Some TJK page variants serve the selected city's
   * result directly from the Page endpoint.
   *
   * Keep this only as a fallback; parser + validator
   * still decide whether the response is a valid final
   * meeting result.
   */
  return {
    pageUrl,

    cityUrl:
      pageUrl,

    cityId:
      null,

    discoveryMethod:
      "city-name-direct"
  };
}


/*
 * OFFICIAL RESULT ACQUISITION
 *
 * TJK's Page endpoint is primarily the outer page /
 * city selector.
 *
 * The actual result table is served from:
 *
 * /Info/Sehir/GunlukYarisSonuclari
 *
 * Therefore:
 *
 * Page
 *   -> discover city id
 *   -> City result URL
 *   -> deterministic acquisition
 *   -> parse
 *   -> strict validation
 *
 * Semantic fallback is still allowed, but it operates
 * against the real city result URL as well.
 */
export async function acquireOfficialResults(
  env: Env,
  input: {
    url: string;
    city: string;
    raceDate: string;
  }
): Promise<AcquiredOfficialResults> {
  const discovered =
    await discoverCityResultUrl({
      raceDate:
        input.raceDate,

      city:
        input.city
    });

  try {
    const deterministic =
      await acquireAndParse(
        env,

        discovered.cityUrl,

        html =>
          parseOfficialResultsHtml(
            html,
            input.city,
            input.raceDate
          ),

        validateOfficialResults
      );

    return {
      value:
        deterministic.value,

      method:
        `${deterministic.acquired.stage}:TJK_CITY_RESULTS`,

      diagnostics: {
        cityId:
          discovered.cityId,

        discoveryMethod:
          discovered.discoveryMethod,

        pageUrl:
          discovered.pageUrl,

        cityUrl:
          discovered.cityUrl,

        acquisition:
          deterministic.diagnostics
      }
    };
  } catch (
    deterministicError
  ) {
    const semantic =
      await extractOfficialResultsSemantic(
        env,

        discovered.cityUrl,

        input.city,
        input.raceDate
      );

    validateOfficialResults(
      semantic.value
    );

    return {
      value:
        semantic.value,

      method:
        `${semantic.method}:TJK_CITY_RESULTS`,

      diagnostics: {
        cityId:
          discovered.cityId,

        discoveryMethod:
          discovered.discoveryMethod,

        pageUrl:
          discovered.pageUrl,

        cityUrl:
          discovered.cityUrl,

        deterministicError:
          deterministicError
            instanceof Error
              ? deterministicError.message
              : String(
                  deterministicError
                ),

        semantic:
          semantic.diagnostics
      }
    };
  }
}
