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
    | "page-city-id"
    | "city-name-direct";
}> {
  const pageUrl =
    buildOfficialResultsPageUrl(
      input.raceDate,
      input.city
    );

  /*
   * SehirId discovery is best-effort.
   *
   * TJK's outer result page can be addressed with
   * QueryParameter_Tarih + SehirAdi. Therefore failure
   * to discover SehirId must not abort acquisition.
   *
   * Preferred path:
   *   page -> discover SehirId -> city endpoint
   *
   * Recovery path:
   *   page addressed directly by SehirAdi
   */
  let cityId:
    string | null =
    null;

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

      cityId =
        extractCityId(
          html,
          input.city
        );
    }
  } catch (error) {
    console.warn(
      "[RESULTS] city id discovery failed",
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

  if (cityId) {
    return {
      pageUrl,

      cityId,

      discoveryMethod:
        "page-city-id",

      cityUrl:
        buildOfficialResultsCityUrl(
          input.raceDate,
          input.city,
          cityId
        )
    };
  }

  /*
   * Root-cause recovery:
   *
   * Do not invent a SehirId.
   * Do not hard-code city IDs.
   *
   * Use the official TJK page URL already containing
   * race date + city name and let the normal parser /
   * validator decide whether it contains valid final
   * results.
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
