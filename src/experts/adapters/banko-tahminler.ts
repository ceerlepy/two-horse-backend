import {
  resolveArticleAdapter
} from "./common";

import {
  acquireResilientArticleHtml,
  resolveResilientArticleTargets
} from "./resilient-article";

import type {
  ExpertAdapter
} from "./types";


const HOME =
  "https://www.bankotahminler.com/";

const CATEGORY =
  "https://www.bankotahminler.com/kategori/tahminler/";

const LIST_READY =
  "body";

const ARTICLE_READY =
  "body";


function ownsArticle(
  value:string
):boolean {
  try {
    const url =
      new URL(value);

    const host =
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase();

    const path =
      url.pathname
        .toLowerCase();

    return (
      host ===
        "bankotahminler.com" &&
      path.startsWith(
        "/tahminler/"
      ) &&
      !path.includes(
        "/ai-tahmin/"
      ) &&
      !path.startsWith(
        "/kategori/"
      )
    );

  } catch {
    return false;
  }
}


export const bankoTahminlerAdapter:
  ExpertAdapter = {
    sourceKey:
      "banko_tahminler",

    async resolve(context) {
      const primary =
        await resolveResilientArticleTargets(
          context,
          {
            landingUrls:[
              HOME,
              CATEGORY
            ],

            readySelector:
              LIST_READY,

            maxPages:4,

            urlPredicate:
              ownsArticle
          }
        );

      if (
        primary.status ===
        "ready"
      ) {
        return primary;
      }

      /*
       * Cheap configured feed fallback.
       * No extra Puppeteer pagination.
       */
      const feed =
        await resolveArticleAdapter(
          context,
          {
            landingUrls:[],
            verifyTargets:true,
            requireCityCoverage:true,
            allowGeneric:false,
            allowFeed:true
          }
        );

      if (
        feed.status ===
        "ready"
      ) {
        return {
          ...feed,

          diagnostics:{
            primary:
              primary.diagnostics,

            feed:
              feed.diagnostics
          }
        };
      }

      return {
        ...primary,

        diagnostics:{
          primary:
            primary.diagnostics,

          feed:
            feed.diagnostics
        }
      };
    },

    ownsAcquisition:
      ownsArticle,

    acquireHtml(context) {
      return acquireResilientArticleHtml(
        context,
        {
          readySelector:
            ARTICLE_READY
        }
      );
    }
  };
