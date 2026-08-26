import {
  turkeyDate
} from "../../shared";

import {
  resolveArticleAdapter,
  resolveDirectAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


const ARCHIVE =
  "https://istinyeganyan.com/kategori/at-yarisi/";


export const istinyeGanyanAdapter:
  ExpertAdapter = {
    sourceKey:
      "istinye_ganyan",

    resolve(
      context
    ) {
      /*
       * Current production never falls into historical
       * archive discovery.
       */
      if (
        context.raceDate <
          turkeyDate()
      ) {
        return resolveArticleAdapter(
          context,
          {
            landingUrls:[
              ARCHIVE
            ],

            preferCards:true,

            cardSelectors:[
              "a[href]",
              "article",
              ".post",
              ".entry",
              "[class*='post']"
            ],

            verifyTargets:true,
            requireCityCoverage:true,

            allowGeneric:false,
            allowFeed:true
          }
        );
      }


      return resolveDirectAdapter(
        context
      );
    }
  };
