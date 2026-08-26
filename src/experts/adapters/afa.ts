import {
  acquireAfaBrowserSession
} from "./browser-session";

import {
  interactiveTarget
} from "./common";

import type {
  ExpertAdapter
} from "./types";


const TERMINAL =
  "https://atlarafisildayanadam.com/terminal";


export const afaAdapter:
  ExpertAdapter = {
    sourceKey:
      "afa",


    async resolve() {
      /*
       * Terminal defaults to current date.
       * Browser acquisition explicitly changes it to the
       * requested race date before extracting any race card.
       */
      return interactiveTarget(
        TERMINAL,
        "direct-current-page",
        "browser-session-date-race-cards"
      );
    },


    ownsAcquisition(
      url
    ) {
      try {
        const a =
          new URL(url);

        const b =
          new URL(TERMINAL);

        return (
          a.origin ===
            b.origin &&
          a.pathname.replace(/\/+$/,"") ===
            b.pathname.replace(/\/+$/,"")
        );

      } catch {
        return false;
      }
    },


    acquireHtml(
      context
    ) {
      return acquireAfaBrowserSession(
        context
      );
    }
  };
