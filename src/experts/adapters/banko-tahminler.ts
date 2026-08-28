import {
  createVerifiedArticleAdapter
} from "./verified-article";

import {
  dateSearchText,
  wordpressSearchUrl
} from "./article-url-utils";

import {
  prepareRaceProseArticle
} from "./race-prose";


const ROOT =
  "https://www.bankotahminler.com/";

const CATEGORY =
  "https://www.bankotahminler.com/kategori/tahminler/";


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
        CATEGORY,
        ROOT,

        wordpressSearchUrl(
          ROOT,
          dateSearchText(
            context.raceDate
          )
        ),

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

    listingCardContext:
      true,

    requireCandidateDateEvidence:
      true,

    maxCandidates:10,
    maxVerifiedPerCity:1,

    allowPartialCoverage:true,

    /*
     * HTTP / CF Content / CF Links / CF Scrape still run first.
     * Browser is only the bounded last rescue.
     */
    allowPuppeteerDiscovery:true,
    allowPuppeteerArticle:true,

    adapterOwnedExtraction:true,

    prepareArticleHtml(
      context,
      acquired
    ) {
      return prepareRaceProseArticle(
        context,
        acquired,
        "BANKO TAHMINLER"
      );
    },

    browserNavigationBudget:4,

    fallback:"feed"
  });
