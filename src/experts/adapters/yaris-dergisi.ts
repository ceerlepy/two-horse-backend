import {
  createVerifiedArticleAdapter
} from "./verified-article";

import {
  dateSearchText,
  wordpressSearchUrl
} from "./article-url-utils";


const ROOT =
  "https://www.yarisdergisi.com/";

const TAG =
  "https://www.yarisdergisi.com/tag/altili-tahmin/";

const LEGACY_TAG =
  "https://www.yarisdergisi.com/tag/yaris-tahminleri/";


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
      !path.startsWith(
        "/tag/"
      ) &&
      !path.startsWith(
        "/category/"
      )
    );

  } catch {
    return false;
  }
}


export const yarisDergisiAdapter =
  createVerifiedArticleAdapter({
    sourceKey:
      "yaris_dergisi",

    sourceName:
      "Yarış Dergisi",

    ownsArticle,

    discoveryUrls(
      context
    ) {
      return [
        /*
         * First shared tag page: one page can contain both
         * Ankara and Kocaeli articles.
         */
        TAG,
        LEGACY_TAG,

        ...context.cities.map(
          city =>
            wordpressSearchUrl(
              ROOT,
              dateSearchText(
                context.raceDate,
                city
              )
            )
        ),

        ROOT
      ];
    },

    negativeTerms:[
      "kombine bahis",
      "kombine-bahis",
      "yurt dışı",
      "yurt-disi"
    ],

    maxCandidates:8,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:true,
    allowPuppeteerArticle:true,

    /*
     * This problematic source owns its bounded article
     * acquisition path.
     */
    adapterOwnedExtraction:true,

    /*
     * TOTAL across listing + verification.
     * Not per page.
     */
    browserNavigationBudget:3,

    fallback:"feed"
  });
