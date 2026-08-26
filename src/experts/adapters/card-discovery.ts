import {
  load
} from "cheerio";

import {
  EXPERT_ACQUISITION_CONFIG
} from "../../config/expert-acquisition";

import {
  acquireExpertHtmlStage
} from "../acquisition-fallback";

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

import {
  selectExpertCandidateUrlsWithWorkersAi
} from "../workers-ai-discovery";

import type {
  DiscoveryCandidateInput
} from "../workers-ai-discovery";

import type {
  ExpertAdapterContext
} from "./types";


export interface SourceCardCandidate
  extends DiscoveryCandidateInput {
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
 * Positive evidence is bounded to THIS card.
 * Date + city must also exist in anchor/permalink identity.
 *
 * No page-level evidence can leak into a stale sibling link.
 */
export function extractSourceCardCandidatesFromHtml(
  input:{
    sourceKey:
      string;

    landingUrl:
      string;

    html:
      string;

    raceDate:
      string;

    cities:
      string[];

    selectors:
      string[];
  }
): SourceCardCandidate[] {
  const $ =
    load(
      input.html
    );


  const byUrl =
    new Map<
      string,
      SourceCardCandidate
    >();


  const consider =
    (
      rawHref:
        string | undefined,

      cardText:
        string,

      identityText:
        string
    ) => {
      if (!rawHref) {
        return;
      }


      const url =
        normalizeUrl(
          input.landingUrl,
          rawHref
        );


      if (
        !url ||
        !isAllowedDiscoveredArticleUrl(
          input.sourceKey,
          url
        )
      ) {
        return;
      }


      const boundedCard =
        cleanExpertInlineText(
          cardText,
          2400
        );


      const boundedIdentity =
        cleanExpertInlineText(
          identityText,
          1000
        );


      const cardEvidence =
        candidateEvidence(
          input.sourceKey,
          url,
          boundedCard,
          input.raceDate,
          input.cities,
          boundedIdentity
        );


      const identityEvidence =
        candidateEvidence(
          input.sourceKey,
          url,
          boundedIdentity,
          input.raceDate,
          input.cities,
          boundedIdentity
        );


      if (
        !cardEvidence.hasDate ||
        !cardEvidence.hasCity ||
        !cardEvidence
          .hasPredictionLanguage ||
        cardEvidence
          .hasNegativeLanguage ||
        !identityEvidence.hasDate ||
        !identityEvidence.hasCity
      ) {
        return;
      }


      const score =
        cardEvidence.score +
        Math.max(
          0,
          identityEvidence.score
        );


      const previous =
        byUrl.get(
          url
        );


      if (
        !previous ||
        score >
          previous.score
      ) {
        byUrl.set(
          url,
          {
            url,

            text:
              boundedCard,

            score,

            matchedCities:
              cardEvidence
                .matchedCities
          }
        );
      }
    };


  for (
    const selector of
    input.selectors
  ) {
    $(selector)
      .each(
        (
          _index,
          element
        ) => {
          const node =
            $(
              element
            );


          const cardText =
            cleanExpertInlineText(
              node.text(),
              2400
            );


          if (
            node.is(
              "a[href]"
            )
          ) {
            consider(
              node.attr(
                "href"
              ),
              cardText,
              node.text()
            );
          }


          node
            .find(
              "a[href]"
            )
            .each(
              (
                _anchorIndex,
                anchorElement
              ) => {
                const anchor =
                  $(
                    anchorElement
                  );


                consider(
                  anchor.attr(
                    "href"
                  ),
                  cardText,
                  anchor.text()
                );
              }
            );
        }
      );
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
      50
    );
}


export async function discoverSourceCards(
  context:
    ExpertAdapterContext,

  landingUrl:
    string,

  selectors:
    string[]
) {
  const byUrl =
    new Map<
      string,
      SourceCardCandidate
    >();


  const stages:
    any[] = [];


  /*
   * Reuse the hardened HTML acquisition boundary.
   * This module never decodes Browser Run scrape envelopes.
   */
  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          context.env,
          landingUrl,
          stage
        );


      const found =
        extractSourceCardCandidatesFromHtml({
          sourceKey:
            context
              .source
              .source_key,

          landingUrl,

          html:
            acquired.html,

          raceDate:
            context.raceDate,

          cities:
            context.cities,

          selectors
        });


      let added=0;


      for (
        const candidate of
        found
      ) {
        const old =
          byUrl.get(
            candidate.url
          );


        if (
          !old ||
          candidate.score >
            old.score
        ) {
          byUrl.set(
            candidate.url,
            candidate
          );

          added++;
        }
      }


      const accumulated =
        [
          ...byUrl.values()
        ];


      stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        parsedCandidates:
          found.length,

        addedCandidates:
          added,

        accumulatedCandidates:
          accumulated.length,

        coverageComplete:
          coverageComplete(
            accumulated,
            context.cities
          )
      });


      if (
        coverageComplete(
          accumulated,
          context.cities
        )
      ) {
        break;
      }

    } catch(error) {
      stages.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(
                error
              )
      });
    }
  }


  const candidates =
    [
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
        50
      );


  if (!candidates.length) {
    return {
      urls:[],

      diagnostics:{
        landingUrl,
        selectors,

        candidateCount:
          0,

        stages,

        ai:null
      }
    };
  }


  const semantic =
    await selectExpertCandidateUrlsWithWorkersAi(
      context.env,
      {
        sourceName:
          context
            .source
            .source_name,

        raceDate:
          context.raceDate,

        cities:
          context.cities,

        candidates
      }
    );


  const allowed =
    new Set(
      candidates.map(
        candidate =>
          candidate.url
      )
    );


  const urls =
    [
      ...new Set(
        semantic.urls
          .filter(
            url =>
              allowed.has(
                url
              )
          )
      )
    ];


  return {
    urls,

    diagnostics:{
      landingUrl,
      selectors,

      candidateCount:
        candidates.length,

      selected:
        urls,

      stages,

      ai:
        semantic.diagnostics
    }
  };
}
