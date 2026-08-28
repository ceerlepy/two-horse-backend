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
  "https://www.yarisdergisi.com/";

const TAG =
  "https://www.yarisdergisi.com/tag/altili-tahmin/";


function fresh(
  value:string,
  raceDate:string
):string {
  const url =
    new URL(value);

  url.searchParams.set(
    "twohorse_date",
    raceDate
  );

  return url.toString();
}


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
         * Current public source-native prediction index.
         */
        fresh(
          TAG,
          context.raceDate
        ),

        /*
         * Narrow source search is secondary discovery only.
         */
        ...context.cities.map(
          city =>
            fresh(
              wordpressSearchUrl(
                ROOT,
                dateSearchText(
                  context.raceDate,
                  city
                )
              ),
              context.raceDate
            )
        ),

        fresh(
          ROOT,
          context.raceDate
        )
      ];
    },

    negativeTerms:[
      "kombine bahis",
      "kombine-bahis",
      "yurt dışı",
      "yurt-disi"
    ],

    /*
     * Critical for compact slugs:
     * e.g. compact date suffix embedded in the article slug.
     */
    requireCandidateDateEvidence:
      true,

    maxCandidates:12,
    maxVerifiedPerCity:1,

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
        "YARIS DERGISI"
      );
    },

    /*
     * 1 listing + max 2 exact article renders.
     */
    browserNavigationBudget:3,

    fallback:"feed"
  });
