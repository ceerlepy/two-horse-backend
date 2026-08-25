import type {
  Env
} from "../env";

import type {
  ExpertSource
} from "./source-types";

import {
  expertLandingUrls,
  expertRootUrl
} from "./source-urls";

import {
  discoverExpertArticleUrls,
  resolveDirectCurrentPageUrl
} from "./discovery";

import {
  expertUsesDirectCurrentPage,
  isAllowedDiscoveredArticleUrl
} from "./source-policy";

import {
  expertSourceConfig
} from "../config/expert-acquisition";

import {
  turkeyDate
} from "../shared";

import {
  discoverExpertFeedUrls
} from "./feed-discovery";

import {
  resolveGanyanCanavariStructuredTargets
} from "./structured-ganyan-canavari";


export interface ExpertTargetResolution {
  status:
    | "ready"
    | "not-published"
    | "unavailable";

  mode:
    | "article"
    | "direct-current-page";

  targets:
    string[];

  discoveredFromUrl:
    string | null;

  discoveryMethod:
    string | null;

  diagnostics:
    any;
}


async function resolveArticleTargets(
  env:
    Env,

  source:
    ExpertSource,

  raceDate:
    string,

  cities:
    string[],

  landingUrls:
    string[],

  allowFeed:
    boolean
): Promise<ExpertTargetResolution> {
  const attempts:
    any[] = [];


  for (const landingUrl of landingUrls) {
    try {
      const discovery =
        await discoverExpertArticleUrls(
          env,
          landingUrl,
          source.source_name,
          cities,
          source.source_key,
          raceDate
        );


      const accepted =
        [
          ...new Set<string>(
            discovery.urls
              .filter(
                url =>
                  !landingUrls.includes(
                    url
                  )
              )
              .filter(
                url =>
                  isAllowedDiscoveredArticleUrl(
                    source.source_key,
                    url
                  )
              )
          )
        ];


      attempts.push({
        landingUrl,

        method:
          discovery.method,

        selected:
          discovery.urls,

        accepted,

        diagnostics:
          discovery.diagnostics
      });


      if (accepted.length) {
        return {
          status:
            "ready",

          mode:
            "article",

          targets:
            accepted,

          discoveredFromUrl:
            landingUrl,

          discoveryMethod:
            discovery.method,

          diagnostics:{
            attempts
          }
        };
      }

    } catch(error) {
      attempts.push({
        landingUrl,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  if (allowFeed) {
    const feed =
      await discoverExpertFeedUrls(
        env,
        source.source_key,
        source.source_name,
        raceDate,
        cities
      );


    if (feed.configured) {
      attempts.push({
        feed:true,

        method:
          feed.method,

        selected:
          feed.urls,

        diagnostics:
          feed.diagnostics
      });
    }


    if (feed.urls.length) {
      return {
        status:
          "ready",

        mode:
          "article",

        targets:
          feed.urls,

        discoveredFromUrl:
          feed.discoveredFromUrl,

        discoveryMethod:
          feed.method,

        diagnostics:{
          attempts
        }
      };
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


export async function resolveExpertSourceTargets(
  env:
    Env,

  source:
    ExpertSource,

  raceDate:
    string,

  cities:
    string[]
): Promise<ExpertTargetResolution> {
  const config =
    expertSourceConfig(
      source.source_key
    );


  /*
   * Ganyan Canavarı:
   *
   * Do NOT let generic root/navigation recovery accidentally
   * promote a menu URL to an article.
   *
   * The site's own runtime city select provides venueValue.
   * The generated target is then probed fail-closed.
   */
  if (
    config.structuredResolver
      ?.kind ===
      "ganyan-canavari"
  ) {
    const structured =
      await resolveGanyanCanavariStructuredTargets(
        env,
        source.source_key,
        raceDate,
        cities
      );


    return {
      status:
        structured.complete &&
        structured.urls.length
          ? "ready"
          : "unavailable",

      mode:
        "article",

      targets:
        structured.complete
          ? structured.urls
          : [],

      discoveredFromUrl:
        structured.complete
          ? (
              config.entryUrls[0] ??
              null
            )
          : null,

      discoveryMethod:
        structured.complete
          ? "structured-dynamic-city-state"
          : null,

      diagnostics:
        structured.diagnostics
    };
  }


  /*
   * Istinye:
   *
   * Current production date NEVER drops into archive.
   *
   * Historical preview/date:
   * archive article discovery only.
   */
  if (
    config.archivePolicy ===
      "historical-only" &&
    raceDate <
      turkeyDate()
  ) {
    return resolveArticleTargets(
      env,
      source,
      raceDate,
      cities,
      config.archiveEntryUrls ??
        [],
      false
    );
  }


  const landingUrls =
    expertLandingUrls(
      source
    );


  if (
    expertUsesDirectCurrentPage(
      source.source_key
    )
  ) {
    const resolved =
      await resolveDirectCurrentPageUrl(
        env,
        source.source_key,
        landingUrls,
        expertRootUrl(
          source
        ),
        raceDate,
        cities
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


  return resolveArticleTargets(
    env,
    source,
    raceDate,
    cities,
    landingUrls,
    true
  );
}
