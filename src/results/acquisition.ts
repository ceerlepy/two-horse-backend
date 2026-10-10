import * as cheerio from "cheerio";

import type {
  Env
} from "../env";

import {
  acquireAndParse
} from "../acquisition/deterministic";

import {
  TJK_BROWSER_USER_AGENT
} from "../acquisition/http";

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
 *
 * Read from the city links on TJK's result pages
 * (September 2026). A city missing here falls back to
 * discovery, which failed for Şanlıurfa on 2026-10-05
 * and left that meeting's results and coupons unlabelled.
 */
const KNOWN_TJK_CITY_IDS:
  Record<string, string> = {
    "adana": "1",
    "izmir": "2",
    "istanbul": "3",
    "bursa": "4",
    "ankara": "5",
    "şanlıurfa": "6",
    "sanliurfa": "6",
    "elazığ": "7",
    "elazig": "7",
    "diyarbakır": "8",
    "diyarbakir": "8",
    "kocaeli": "9"
  };


export function knownCityId(
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


export async function discoverCityResultUrl(
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
              TJK_BROWSER_USER_AGENT,

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
    let semantic:
      Awaited<
        ReturnType<
          typeof extractOfficialResultsSemantic
        >
      >;

    try {
      semantic =
        await extractOfficialResultsSemantic(
          env,

          discovered.cityUrl,

          input.city,
          input.raceDate
        );

      validateOfficialResults(
        semantic.value
      );
    } catch (
      semanticError
    ) {
      /*
       * Keep BOTH failures. Previously only the semantic
       * fallback's message survived (e.g. RESULT_NO_FINAL_RACES),
       * which hid why the deterministic HTML path failed.
       */
      const message = (
        value: unknown
      ) =>
        value instanceof Error
          ? value.message
          : String(value);

      throw new Error(
        `${message(semanticError)} | deterministic: ${message(deterministicError).slice(0, 600)} | url: ${discovered.cityUrl}`
      );
    }

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
