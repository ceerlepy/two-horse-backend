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


const TAG =
  "https://www.yarisdergisi.com/tag/yaris-tahminleri/";

const LIST_READY =
  "article a[href],.post a[href],.entry a[href],h2 a[href],h3 a[href]";

const ARTICLE_READY =
  "article,main,.entry-content,.post-content,[role='main'],h1";


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
        "yarisdergisi.com" &&
      path !== "/" &&
      !path.startsWith("/tag/") &&
      !path.startsWith("/category/")
    );

  } catch {
    return false;
  }
}


export const yarisDergisiAdapter:
  ExpertAdapter = {
    sourceKey:
      "yaris_dergisi",

    async resolve(context) {
      const primary =
        await resolveResilientArticleTargets(
          context,
          {
            landingUrls:[
              TAG
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
      )
        return primary;


      /*
       * Feed is cheap HTTP fallback.
       * Generic Browser discovery is intentionally disabled.
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
