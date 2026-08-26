import {
  acquireAfaBrowserSession
} from "./afa-browser-session";

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
      return cityScopedResolution(
        TERMINAL,
        context.cities,
        "direct-current-page",
        "browser-session-city-race-panels"
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
