import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


const ROOT =
  "https://www.bankotahminler.com/";

const MOBILE =
  "https://www.bankotahminler.com/mobil/";

const CATEGORY =
  "https://www.bankotahminler.com/kategori/tahminler/";


export const bankoTahminlerAdapter:
  ExpertAdapter = {
    sourceKey:
      "banko_tahminler",

    resolve(
      context
    ) {
      /*
       * HTTP and RSS currently return 403.
       * Browser-rendered /tahminler/ anchors are the source
       * contract.
       */
      return resolveArticleAdapter(
        context,
        {
          landingUrls:[
            ROOT,
            MOBILE,
            CATEGORY
          ],

          preferCards:true,

          cardSelectors:[
            "a[href*='/tahminler/']",
            "article",
            ".post",
            "[class*='post']"
          ],

          verifyTargets:true,
          requireCityCoverage:true,

          allowGeneric:false,
          allowFeed:false
        }
      );
    }
  };
