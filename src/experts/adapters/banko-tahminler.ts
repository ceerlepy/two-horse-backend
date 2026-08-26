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
      return resolveArticleAdapter(
        context,
        {
          landingUrls:[
            CATEGORY,
            ROOT,
            MOBILE
          ],

          verifyTargets:true,
          requireCityCoverage:true,
          allowGeneric:true,
          allowFeed:false
        }
      );
    }
  };
