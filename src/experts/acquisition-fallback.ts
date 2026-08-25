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

import type {
  ExpertHtmlAcquisitionStage
} from "../config/expert-acquisition";


export async function acquireExpertHtmlStage(
  env:
    Env,

  url:
    string,

  stage:
    ExpertHtmlAcquisitionStage
): Promise<AcquiredHtml> {
  switch(stage) {

    case "cf-scrape":
      return acquireCfScrapeHtml(
        env,
        url
      );


    case "cf-content":
      return acquireCfContentHtml(
        env,
        url
      );


    case "http":
      return acquireHttpHtml(
        url,
        {
          timeoutMs:
            12_000,

          minimumBytes:
            500,

          userAgent:
            "TwoHorse/1.0 (+expert-acquisition)"
        }
      );
  }
}
