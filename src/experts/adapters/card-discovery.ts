import {
  candidateEvidence
} from "../discovery";

import {
  isAllowedDiscoveredArticleUrl
} from "../source-policy";

import {
  cleanExpertInlineText,
  normalizeExpertSearchText
} from "../text-normalization";

import type {
  ExpertAdapterContext
} from "./types";


export interface RawAnchorCandidate {
  href:
    string;

  text:
    string;
}


export interface SourceCardCandidate {
  url:
    string;

  text:
    string;

  score:
    number;

  matchedCities:
    string[];
}


function normalizeUrl(
  base:
    string,

  value:
    string
): string | null {
  try {
    const url =
      new URL(
        value,
        base
      );


    if (
      url.protocol !==
        "https:" &&
      url.protocol !==
        "http:"
    ) {
      return null;
    }


    url.hash="";


    return url.toString();

  } catch {
    return null;
  }
}


function sameCity(
  first:
    string,

  second:
    string
): boolean {
  return (
    normalizeExpertSearchText(
      first
    ) ===
    normalizeExpertSearchText(
      second
    )
  );
}


function coverageComplete(
  candidates:
    SourceCardCandidate[],

  cities:
    string[]
): boolean {
  return cities.every(
    city =>
      candidates.some(
        candidate =>
          candidate
            .matchedCities
            .some(
              matched =>
                sameCity(
                  city,
                  matched
                )
            )
      )
  );
}


/*
 * IMPORTANT:
 *
 * Discovery evidence is restricted to:
 *   - candidate href
 *   - candidate anchor text
 *
 * We intentionally do not use page/global ancestor text here.
 *
 * This prevents a current-date page from donating its
 * date/city evidence to an old Yaris Dergisi article.
 */
export function extractAnchorCandidates(
  input:{
    sourceKey:
      string;

    landingUrl:
      string;

    raceDate:
      string;

    cities:
      string[];

    anchors:
      RawAnchorCandidate[];
  }
): SourceCardCandidate[] {
  const byUrl =
    new Map<
      string,
      SourceCardCandidate
    >();


  for (
    const anchor of
    input.anchors
  ) {
    const url =
      normalizeUrl(
        input.landingUrl,
        anchor.href
      );


    if (
      !url ||
      !isAllowedDiscoveredArticleUrl(
        input.sourceKey,
        url
      )
    ) {
      continue;
    }


    const text =
      cleanExpertInlineText(
        anchor.text,
        1200
      );


    const evidence =
      candidateEvidence(
        input.sourceKey,
        url,
        text,
        input.raceDate,
        input.cities,
        text
      );


    if (
      !evidence.hasDate ||
      !evidence.hasCity ||
      !evidence
        .hasPredictionLanguage ||
      evidence
        .hasNegativeLanguage
    ) {
      continue;
    }


    const previous =
      byUrl.get(
        url
      );


    if (
      !previous ||
      evidence.score >
        previous.score
    ) {
      byUrl.set(
        url,
        {
          url,
          text,

          score:
            evidence.score,

          matchedCities:
            evidence
              .matchedCities
        }
      );
    }
  }


  return [
    ...byUrl.values()
  ]
    .sort(
      (
        first,
        second
      ) =>
        second.score -
        first.score
    )
    .slice(
      0,
      80
    );
}


function resultGroups(
  raw:
    any
): any[] {
  const payload =
    (
      raw &&
      typeof raw ===
        "object" &&
      "result" in raw
    )
      ? raw.result
      : raw;


  return Array.isArray(
    payload
  )
    ? payload
    : [];
}


function anchorsFromScrape(
  raw:
    any
): RawAnchorCandidate[] {
  const output:
    RawAnchorCandidate[] = [];


  for (
    const group of
    resultGroups(
      raw
    )
  ) {
    const values =
      Array.isArray(
        group?.results
      )
        ? group.results
        : [];


    for (
      const value of
      values
    ) {
      const attributes =
        Array.isArray(
          value?.attributes
        )
          ? value.attributes
          : [];


      const hrefAttribute =
        attributes.find(
          (
            attribute:any
          ) =>
            String(
              attribute?.name ??
              ""
            )
              .toLowerCase() ===
            "href"
        );


      const href =
        hrefAttribute?.value
          ? String(
              hrefAttribute.value
            )
          : "";


      if (!href) {
        continue;
      }


      output.push({
        href,

        text:
          String(
            value?.text ??
            ""
          )
      });
    }
  }


  return output;
}


export async function discoverSourceCards(
  context:
    ExpertAdapterContext,

  landingUrl:
    string,

  selectors:
    string[]
) {
  /*
   * Cloudflare /scrape returns the actual outer element
   * attributes, including href.
   *
   * This avoids the old body-innerHTML problem where the
   * anchor itself disappeared and Cheerio saw zero links.
   */
  const response =
    await context.env.BROWSER.quickAction(
      "scrape",
      {
        url:
          landingUrl,

        elements:[
          {
            selector:
              "a[href]"
          }
        ],

        gotoOptions:{
          waitUntil:
            "networkidle2",

          timeout:
            30_000
        }
      } as any
    );


  if (!response.ok) {
    throw new Error(
      `ADAPTER_ANCHOR_SCRAPE_HTTP_${response.status}`
    );
  }


  const raw:any =
    await response.json();


  const anchors =
    anchorsFromScrape(
      raw
    );


  const candidates =
    extractAnchorCandidates({
      sourceKey:
        context
          .source
          .source_key,

      landingUrl,

      raceDate:
        context.raceDate,

      cities:
        context.cities,

      anchors
    });


  return {
    urls:
      candidates.map(
        candidate =>
          candidate.url
      ),

    diagnostics:{
      landingUrl,

      requestedSelectors:
        selectors,

      actualSelector:
        "a[href]",

      scrapedAnchors:
        anchors.length,

      candidateCount:
        candidates.length,

      coverageComplete:
        coverageComplete(
          candidates,
          context.cities
        ),

      candidates:
        candidates.map(
          candidate => ({
            url:
              candidate.url,

            score:
              candidate.score,

            matchedCities:
              candidate
                .matchedCities,

            text:
              candidate
                .text
                .slice(
                  0,
                  300
                )
          })
        )
    }
  };
}
