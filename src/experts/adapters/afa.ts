import {
  acquireAfaBrowserSession
} from "./browser-session";

import {
  cityScopedResolution,
  sameExternalPage
} from "./target-scope";

import type {
  ExpertAdapter
} from "./types";


const TERMINAL =
  "https://atlarafisildayanadam.com/terminal";


export const afaAdapter:
  ExpertAdapter = {
    sourceKey:
      "afa",


    async resolve(
      context
    ) {
      /*
       * One target represents one city's complete daily AFA
       * bulletin.
       *
       * We never click 1.Kosu, 2.Kosu, ... individually.
       */
      return cityScopedResolution(
        TERMINAL,
        context.cities,
        "direct-current-page",
        "browser-session-city-daily-bulletin"
      );
    },


    ownsAcquisition(
      url
    ) {
      return sameExternalPage(
        url,
        TERMINAL
      );
    },


    acquireHtml(
      context
    ) {
      return acquireAfaBrowserSession(
        context
      );
    }
  };
