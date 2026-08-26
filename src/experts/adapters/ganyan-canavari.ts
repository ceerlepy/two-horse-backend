import {
  acquireGanyanBrowserSession
} from "./browser-session";

import {
  interactiveTarget,
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


const NEWS =
  "https://www.ganyancanavari.com.tr/haberler/";

const INTERACTIVE =
  "https://www.ganyancanavari.com.tr/site/galoplar-ozet.html";


function sameTarget(
  first:
    string,

  second:
    string
): boolean {
  try {
    const a =
      new URL(first);

    const b =
      new URL(second);

    a.hash="";
    b.hash="";

    return (
      a.origin ===
        b.origin &&
      a.pathname.replace(/\/+$/,"") ===
        b.pathname.replace(/\/+$/,"")
    );

  } catch {
    return false;
  }
}


export const ganyanCanavariAdapter:
  ExpertAdapter = {
    sourceKey:
      "ganyan_canavari",


    async resolve(
      context
    ) {
      /*
       * PRIMARY:
       * date/city-specific editorial racing analysis.
       */
      const article =
        await resolveArticleAdapter(
          context,
          {
            landingUrls:[
              NEWS
            ],

            preferCards:true,

            cardSelectors:[
              "article",
              ".post",
              ".entry",
              "a[href*='/haber']",
              "[class*='post']",
              "[class*='news']"
            ],

            verifyTargets:true,
            requireCityCoverage:true,

            allowGeneric:false,
            allowFeed:false
          }
        );


      if (
        article.status ===
          "ready" &&
        article.targets.length >
          0
      ) {
        return article;
      }


      /*
       * SECONDARY:
       * use the site's real runtime date/city state.
       *
       * No hard-coded venue IDs exist.
       */
      const fallback =
        interactiveTarget(
          INTERACTIVE,
          "article",
          "browser-session-date-city-state"
        );


      fallback.diagnostics = {
        articleAttempt:
          article.diagnostics,

        fallback:
          fallback.diagnostics
      };


      return fallback;
    },


    ownsAcquisition(
      url
    ) {
      return sameTarget(
        url,
        INTERACTIVE
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
