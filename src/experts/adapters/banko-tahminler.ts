import {
  createVerifiedArticleAdapter
} from "./verified-article";

import {
  dateSearchText,
  wordpressSearchUrl
} from "./article-url-utils";


const ROOT =
  "https://www.bankotahminler.com/";

const CATEGORY =
  "https://www.bankotahminler.com/kategori/tahminler/";

const BULLETIN =
  "https://www.bankotahminler.com/bulten/";


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
      )
    );

  } catch {
    return false;
  }
}


export const bankoTahminlerAdapter =
  createVerifiedArticleAdapter({
    sourceKey:
      "banko_tahminler",

    sourceName:
      "Banko Tahminler",

    ownsArticle,

    discoveryUrls(
      context
    ) {
      return [
        /*
         * Date-only search first:
         * ideally Ankara + Kocaeli on one rendered page.
         */
        wordpressSearchUrl(
          ROOT,
          dateSearchText(
            context.raceDate
          )
        ),

        CATEGORY,
        BULLETIN,

        ...context.cities.map(
          city =>
            wordpressSearchUrl(
              ROOT,
              dateSearchText(
                context.raceDate,
                city
              )
            )
        )
      ];
    },

    negativeTerms:[
      "ai tahmin",
      "ai-tahmin",
      "yurt dışı",
      "yurt-disi",
      "abd",
      "şili",
      "fransa",
      "birleşik krallık"
    ],

    maxCandidates:8,
    maxVerifiedPerCity:2,

    allowPuppeteerDiscovery:true,
    allowPuppeteerArticle:true,

    /*
     * This problematic source owns its bounded article
     * acquisition path.
     */
    adapterOwnedExtraction:true,

    browserNavigationBudget:2,

    fallback:"feed"
  });
