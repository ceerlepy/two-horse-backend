import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../../config/expert-acquisition";

import {
  acquireExpertHtmlStage
} from "../acquisition-fallback";

import {
  expertArticleTextFromHtml
} from "../article-text";

import {
  buildExpertRaceDateTokens
} from "../date-evidence";

import {
  discoverExpertArticleUrls,
  resolveDirectCurrentPageUrl
} from "../discovery";

import {
  discoverExpertFeedUrls
} from "../feed-discovery";

import {
  expertLandingUrls,
  expertRootUrl
} from "../source-urls";

import {
  isAllowedDiscoveredArticleUrl
} from "../source-policy";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  discoverSourceCards
} from "./card-discovery";

import type {
  ExpertAdapterContext,
  ExpertTargetResolution
} from "./types";


function normalizedCity(
  value:
    string
): string {
  return normalizeExpertSearchText(
    value
  );
}


export async function verifyTargetIdentity(
  context:
    ExpertAdapterContext,

  url:
    string
) {
  const sourceConfig =
    expertSourceConfig(
      context.source.source_key
    );

  const dateTokens =
    buildExpertRaceDateTokens(
      context.raceDate,
      {
        allowYearless:
          sourceConfig
            .allowYearlessDateEvidence
      }
    );

  const urlMaterial =
    normalizeExpertSearchText(
      url
    );

  const urlDateHit =
    dateTokens.some(
      token =>
        urlMaterial.includes(
          token
        )
    );

  const urlCities =
    context.cities
      .filter(
        city =>
          urlMaterial.includes(
            normalizedCity(
              city
            )
          )
      );

  /*
   * Exact date + city in permalink is already a strong,
   * bounded identity proof. No extra browser request needed.
   */
  if (
    urlDateHit &&
    urlCities.length
  ) {
    return {
      ok:true,
      method:
        "url-identity",

      matchedCities:
        urlCities,

      diagnostics:{
        urlDateHit:true,
        urlCities
      }
    };
  }


  const attempts:
    any[] = [];


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
          url,
          stage
        );

      const article =
        expertArticleTextFromHtml(
          acquired.html
        );

      const material =
        normalizeExpertSearchText(
          [
            url,
            article.text
          ].join(" ")
        );

      const dateHit =
        dateTokens.some(
          token =>
            material.includes(
              token
            )
        );

      const matchedCities =
        context.cities
          .filter(
            city =>
              material.includes(
                normalizedCity(
                  city
                )
              )
          );

      const racingHit =
        EXPERT_ACQUISITION_CONFIG
          .extraction
          .relevanceTerms
          .some(
            term =>
              material.includes(
                normalizeExpertSearchText(
                  term
                )
              )
          );

      const ok =
        dateHit &&
        matchedCities.length >
          0 &&
        racingHit;

      attempts.push({
        stage,
        dateHit,
        matchedCities,
        racingHit,
        characters:
          article.outputCharacters,
        ok
      });

      if (ok) {
        return {
          ok:true,
          method:
            stage,

          matchedCities,

          diagnostics:{
            attempts
          }
        };
      }

    } catch(error) {
      attempts.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    ok:false,

    method:null,

    matchedCities:[],

    diagnostics:{
      attempts
    }
  };
}


async function discoverScrapedCards(
  context:
    ExpertAdapterContext,

  landingUrl:
    string,

  selectors:
    string[]
) {
  return discoverSourceCards(
    context,
    landingUrl,
    selectors
  );
}


async function acceptTargets(
  context:
    ExpertAdapterContext,

  urls:
    string[],

  verify:
    boolean,

  requireCoverage:
    boolean
) {
  const accepted:
    string[] = [];

  const verifications:
    any[] = [];

  const covered =
    new Set<string>();


  for (
    const url of
    [
      ...new Set(urls)
    ]
  ) {
    if (
      !isAllowedDiscoveredArticleUrl(
        context.source.source_key,
        url
      )
    ) {
      continue;
    }


    if (!verify) {
      accepted.push(
        url
      );
      continue;
    }


    const verification =
      await verifyTargetIdentity(
        context,
        url
      );


    verifications.push({
      url,
      ...verification
    });


    if (!verification.ok) {
      continue;
    }


    accepted.push(
      url
    );


    for (
      const city of
      verification.matchedCities
    ) {
      covered.add(
        normalizedCity(
          city
        )
      );
    }
  }


  const missingCities =
    requireCoverage &&
    verify
      ? context.cities
          .filter(
            city =>
              !covered.has(
                normalizedCity(
                  city
                )
              )
          )
      : [];


  return {
    accepted:
      missingCities.length
        ? []
        : accepted,

    verifications,
    missingCities
  };
}


export async function resolveArticleAdapter(
  context:
    ExpertAdapterContext,

  options:{
    landingUrls?:
      string[];

    cardSelectors?:
      string[];

    preferCards?:
      boolean;

    allowFeed?:
      boolean;

    allowGeneric?:
      boolean;

    verifyTargets?:
      boolean;

    requireCityCoverage?:
      boolean;
  } = {}
): Promise<ExpertTargetResolution> {
  const landingUrls =
    options.landingUrls ??
    expertLandingUrls(
      context.source
    );

  const attempts:
    any[] = [];


  const tryAccepted =
    async (
      urls:
        string[],

      method:
        string,

      from:
        string | null,

      diagnostics:
        any
    ):
      Promise<
        ExpertTargetResolution |
        null
      > => {

      const accepted =
        await acceptTargets(
          context,
          urls,
          options.verifyTargets ===
            true,
          options
            .requireCityCoverage ===
            true
        );


      attempts.push({
        from,
        method,
        selected:
          urls,
        accepted:
          accepted.accepted,
        verification:
          accepted.verifications,
        missingCities:
          accepted.missingCities,
        diagnostics
      });


      if (
        !accepted
          .accepted
          .length
      ) {
        return null;
      }


      return {
        status:
          "ready",

        mode:
          "article",

        targets:
          accepted.accepted,

        discoveredFromUrl:
          from,

        discoveryMethod:
          method,

        diagnostics:{
          attempts
        }
      };
    };


  if (
    options.preferCards &&
    options.cardSelectors
      ?.length
  ) {
    for (
      const landingUrl of
      landingUrls
    ) {
      try {
        const cards =
          await discoverScrapedCards(
            context,
            landingUrl,
            options.cardSelectors
          );


        const ready =
          await tryAccepted(
            cards.urls,
            "adapter-card-workers-ai-selection",
            landingUrl,
            cards.diagnostics
          );


        if (ready) {
          return ready;
        }

      } catch(error) {
        attempts.push({
          from:
            landingUrl,

          method:
            "adapter-card",

          error:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }
    }
  }


  const genericLandingUrls =
    options.allowGeneric ===
      false
      ? []
      : landingUrls;


  for (
    const landingUrl of
    genericLandingUrls
  ) {
    try {
      const discovery =
        await discoverExpertArticleUrls(
          context.env,
          landingUrl,
          context.source.source_name,
          context.cities,
          context.source.source_key,
          context.raceDate
        );


      const ready =
        await tryAccepted(
          discovery.urls,
          discovery.method,
          landingUrl,
          discovery.diagnostics
        );


      if (ready) {
        return ready;
      }

    } catch(error) {
      attempts.push({
        from:
          landingUrl,

        method:
          "generic-discovery",

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  if (
    options.allowFeed !==
      false
  ) {
    const feed =
      await discoverExpertFeedUrls(
        context.env,
        context.source.source_key,
        context.source.source_name,
        context.raceDate,
        context.cities
      );


    if (feed.configured) {
      const ready =
        await tryAccepted(
          feed.urls,
          feed.method ??
            "feed",
          feed.discoveredFromUrl,
          feed.diagnostics
        );


      if (ready) {
        return ready;
      }
    }
  }


  return {
    status:
      "not-published",

    mode:
      "article",

    targets:[],

    discoveredFromUrl:null,
    discoveryMethod:null,

    diagnostics:{
      attempts
    }
  };
}


export async function resolveDirectAdapter(
  context:
    ExpertAdapterContext
): Promise<ExpertTargetResolution> {
  const landingUrls =
    expertLandingUrls(
      context.source
    );


  const resolved =
    await resolveDirectCurrentPageUrl(
      context.env,
      context.source.source_key,
      landingUrls,
      expertRootUrl(
        context.source
      ),
      context.raceDate,
      context.cities
    );


  return {
    status:
      resolved.url
        ? "ready"
        : "unavailable",

    mode:
      "direct-current-page",

    targets:
      resolved.url
        ? [
            resolved.url
          ]
        : [],

    discoveredFromUrl:
      resolved.url,

    discoveryMethod:
      resolved.url
        ? "direct-page-resolver"
        : null,

    diagnostics:
      resolved.diagnostics
  };
}


export function interactiveTarget(
  url:
    string,

  mode:
    "article" |
    "direct-current-page",

  method:
    string
): ExpertTargetResolution {
  return {
    status:
      "ready",

    mode,

    targets:[
      url
    ],

    discoveredFromUrl:
      url,

    discoveryMethod:
      method,

    diagnostics:{
      adapterInteractive:true,
      url
    }
  };
}
