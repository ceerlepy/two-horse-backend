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
        /*
         * Proven normal-HTTP public editorial index.
         */
        CATEGORY,

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

    /*
     * This closes the 25-Aug Kocaeli -> 27-Aug bug.
     */
    requireCandidateDateEvidence:
      true,

    maxCandidates:8,
    maxVerifiedPerCity:1,

    /*
     * Human editorial does not necessarily publish
     * both canonical cities every day.
     */
    allowPartialCoverage:true,

    /*
     * Proven current path:
     * listing HTTP works
     * exact article HTTP works.
     *
     * CF Content/Scrape remain inside acquisition ladder
     * only if ordinary HTTP genuinely fails.
     */
    allowPuppeteerDiscovery:false,
    allowPuppeteerArticle:false,

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

    fallback:"feed"
  });
