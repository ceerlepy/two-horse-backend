import type {
  Env
} from "../env";

import type {
  AcquiredHtml
} from "../acquisition/types";

import {
  acquireCfScrapeHtml,
  acquireCfContentHtml
} from "../acquisition/cloudflare-html";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  acquireWpJsonHtml
} from "../acquisition/wp-json";

import type {
  ExpertHtmlAcquisitionStage
} from "../config/expert-acquisition";


/*
 * Nothing in this pipeline ever benefits from a cached response —
 * every fetch exists to read a source's current state. Beyond our
 * own edge cache settings, the ORIGIN itself (WordPress page-cache
 * plugins are extremely common on these sites) can serve the same
 * cached body to every visitor for extended periods regardless of
 * our request's cache directives. A unique query parameter changes
 * the cache key everywhere — ours, Cloudflare's, and the origin's —
 * so this is the one bypass that actually reaches all of them.
 */
function bustCache(
  url:
    string
):string {
  try {
    const bust =
      new URL(url);

    bust.searchParams.set(
      "_thcb",
      Date.now().toString(36)
    );

    return bust.toString();

  } catch {
    return url;
  }
}


export async function acquireExpertHtmlStage(
  env:
    Env,

  url:
    string,

  stage:
    ExpertHtmlAcquisitionStage
): Promise<AcquiredHtml> {
  const fetchUrl =
    bustCache(url);

  const acquired =
    await (async () => {
      switch(stage) {

        case "cf-scrape":
          return acquireCfScrapeHtml(
            env,
            fetchUrl
          );


        case "cf-content":
          return acquireCfContentHtml(
            env,
            fetchUrl
          );


        case "http":
          return acquireHttpHtml(
            fetchUrl,
            {
              timeoutMs:
                12_000,

              minimumBytes:
                500,

              userAgent:
                "TwoHorse/1.0 (+expert-acquisition)"
            }
          );


        case "wp-json":
          /*
           * The REST API isn't page-cached like the human-facing
           * site, and a slug is a path segment — cache-busting the
           * query string would do nothing useful here.
           */
          return acquireWpJsonHtml(
            url
          );
      }
    })();

  return {
    ...acquired,

    requestedUrl:
      url
  };
}
