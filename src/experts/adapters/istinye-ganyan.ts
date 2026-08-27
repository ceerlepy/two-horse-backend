import {
  turkeyDate
} from "../../shared";

import {
  resolveArticleAdapter,
  resolveDirectAdapter
} from "./common";

import {
  acquireResilientArticleHtml,
  resolveResilientArticleTargets
} from "./resilient-article";

import type {
  ExpertAdapter
} from "./types";


const ARCHIVE =
  "https://istinyeganyan.com/kategori/at-yarisi/";

const CURRENT =
  "https://istinyeganyan.com/ganyan/tahminler/";

const LIST_READY =
  "article a[href],.post a[href],.entry a[href],h2 a[href],h3 a[href]";

const ARTICLE_READY =
  "article,main,.entry-content,.post-content,[role='main'],h1";


function ownsHistorical(
  value:string
):boolean {
  try {
    const url =
      new URL(value);

    const host =
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase();

    return (
      host ===
        "istinyeganyan.com" &&
      url.toString() !==
        CURRENT &&
      !url.pathname
        .toLowerCase()
        .startsWith(
          "/kategori/"
        )
    );

  } catch {
    return false;
  }
}


export const istinyeGanyanAdapter:
  ExpertAdapter = {
    sourceKey:
      "istinye_ganyan",

    async resolve(context) {
      if (
        context.raceDate >=
        turkeyDate()
      ) {
        return resolveDirectAdapter(
          context
        );
      }


      const primary =
        await resolveResilientArticleTargets(
          context,
          {
            landingUrls:[
              ARCHIVE
            ],

            readySelector:
              LIST_READY,

            maxPages:5,

            urlPredicate:
              ownsHistorical
          }
        );

      if (
        primary.status ===
        "ready"
      )
        return primary;


      /*
       * Historical feed fallback only.
       * Do not restart expensive generic Browser discovery.
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
      ownsHistorical,

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
