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
          ? [resolved.url]
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
          ...new Set(
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
