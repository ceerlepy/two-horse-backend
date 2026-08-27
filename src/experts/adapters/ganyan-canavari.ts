import {
  acquireGanyanGalopArticle
} from "./ganyan-article";

import {
  resolveResilientArticleTargets
} from "./resilient-article";

import type {
  ExpertAdapter
} from "./types";


const NEWS =
  "https://www.ganyancanavari.com.tr/haberler/";

const LIST_READY =
  "body";


function isGalopArticle(
  value:string
):boolean {
  try {
    const path =
      decodeURIComponent(
        new URL(value)
          .pathname
      )
        .normalize("NFKC")
        .toLocaleLowerCase(
          "tr-TR"
        );

    return (
      path.includes(
        "/haber-detay/"
      ) &&
      path.includes(
        "galop-incelemesi"
      )
    );

  } catch {
    return false;
  }
}


export const ganyanCanavariAdapter:
  ExpertAdapter = {
    sourceKey:
      "ganyan_canavari",

    resolve(context) {
      return resolveResilientArticleTargets(
        context,
        {
          landingUrls:[
            NEWS
          ],

          readySelector:
            LIST_READY,

          maxPages:3,

          pageUrlBuilder(
            base,
            page
          ) {
            if (page <= 1) {
              return base;
            }

            return new URL(
              String(page),
              base
            ).toString();
          },

          urlPredicate:
            isGalopArticle
        }
      );
    },

    ownsAcquisition:
      isGalopArticle,

    /*
     * Keep the proven source-specific
     * "En Son Yorumlar" extractor.
     */
    acquireHtml:
      acquireGanyanGalopArticle
  };
