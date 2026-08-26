import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


const ROOT =
  "https://atlarafisildayanadam.com/";

const NEWS =
  "https://atlarafisildayanadam.com/haberler/";


export const afaAdapter:
  ExpertAdapter = {
    sourceKey:
      "afa",


    resolve(
      context
    ) {
      /*
       * AFA publishes one daily pre-race analysis article
       * per city.
       *
       * One city article -> one AI extraction.
       * No race-by-race browser clicking.
       */
      return resolveArticleAdapter(
        context,
        {
          landingUrls:[
            ROOT,
            NEWS
          ],

          preferCards:true,

          cardSelectors:[
            "a[href*='/haberler/']",
            "article",
            "[class*='haber']",
            "[class*='post']",
            "[class*='card']"
          ],

          verifyTargets:true,
          requireCityCoverage:true,

          allowGeneric:false,
          allowFeed:false
        }
      );
    }
  };
