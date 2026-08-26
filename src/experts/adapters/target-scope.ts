import {
  normalizeExpertSearchText
} from "../text-normalization";

import type {
  ExpertTargetResolution
} from "./types";


const CITY_HASH_PREFIX =
  "twohorse-city=";


export function cityScopedTarget(
  baseUrl:
    string,

  city:
    string
): string {
  const url =
    new URL(
      baseUrl
    );


  url.hash =
    CITY_HASH_PREFIX +
    encodeURIComponent(
      city
    );


  return url.toString();
}


export function cityFromTarget(
  value:
    string
): string | null {
  try {
    const raw =
      new URL(
        value
      )
        .hash
        .replace(
          /^#/,
          ""
        );


    if (
      !raw.startsWith(
        CITY_HASH_PREFIX
      )
    ) {
      return null;
    }


    const city =
      decodeURIComponent(
        raw.slice(
          CITY_HASH_PREFIX.length
        )
      )
        .trim();


    return city ||
      null;

  } catch {
    return null;
  }
}


export function externalTargetUrl(
  value:
    string
): string {
  try {
    const url =
      new URL(
        value
      );


    url.hash="";


    return url.toString();

  } catch {
    return value;
  }
}


export function isCityScopedTarget(
  value:
    string
): boolean {
  return Boolean(
    cityFromTarget(
      value
    )
  );
}


export function sameExternalPage(
  first:
    string,

  second:
    string
): boolean {
  try {
    const a =
      new URL(
        externalTargetUrl(
          first
        )
      );

    const b =
      new URL(
        externalTargetUrl(
          second
        )
      );


    return (
      a.origin ===
        b.origin &&
      a.pathname
        .replace(
          /\/+$/,
          ""
        ) ===
        b.pathname
          .replace(
            /\/+$/,
            ""
          )
    );

  } catch {
    return false;
  }
}


export function targetCitiesForUrl(
  value:
    string,

  canonicalCities:
    string[]
): string[] {
  const scoped =
    cityFromTarget(
      value
    );


  if (scoped) {
    const normalized =
      normalizeExpertSearchText(
        scoped
      );


    const canonical =
      canonicalCities.find(
        city =>
          normalizeExpertSearchText(
            city
          ) ===
            normalized
      );


    return canonical
      ? [
          canonical
        ]
      : [];
  }


  const material =
    normalizeExpertSearchText(
      value
    );


  const matched =
    canonicalCities.filter(
      city =>
        material.includes(
          normalizeExpertSearchText(
            city
          )
        )
    );


  return matched.length
    ? matched
    : canonicalCities;
}


export function cityScopedResolution(
  baseUrl:
    string,

  cities:
    string[],

  mode:
    ExpertTargetResolution[
      "mode"
    ],

  discoveryMethod:
    string
): ExpertTargetResolution {
  const uniqueCities =
    [
      ...new Set(
        cities
          .map(
            city =>
              String(
                city
              )
                .trim()
          )
          .filter(Boolean)
      )
    ];


  return {
    status:
      uniqueCities.length
        ? "ready"
        : "unavailable",

    mode,

    targets:
      uniqueCities.map(
        city =>
          cityScopedTarget(
            baseUrl,
            city
          )
      ),

    discoveredFromUrl:
      null,

    discoveryMethod,

    diagnostics:{
      cityScoped:
        true,

      baseUrl,

      cities:
        uniqueCities
    }
  };
}
