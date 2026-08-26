import {
  acquireGanyanBrowserSession
} from "./browser-session";

import {
  cityScopedResolution,
  sameExternalPage
} from "./target-scope";

import type {
  ExpertAdapter
} from "./types";


const PROGRAM =
  "https://www.ganyancanavari.com.tr/site/yaris-programi.html";


export const ganyanCanavariAdapter:
  ExpertAdapter = {
    sourceKey:
      "ganyan_canavari",


    async resolve(
      context
    ) {
      /*
       * Use requested-date/requested-city runtime comments.
       *
       * Do not treat protected Galop Incelemesi articles or
       * generic "dikkat edilmesi gerekenler" pages as the
       * source's expert-selection document.
       */
      return cityScopedResolution(
        PROGRAM,
        context.cities,
        "direct-current-page",
        "browser-session-date-city-comments"
      );
    },


    ownsAcquisition(
      url
    ) {
      return sameExternalPage(
        url,
        PROGRAM
      );
    },


    acquireHtml(
      context
    ) {
      return acquireGanyanBrowserSession(
        context
      );
    }
  };
