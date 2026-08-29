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
        TAG,

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

    listingCardContext:
      true,

    requireCandidateDateEvidence:
      true,

    maxCandidates:12,
    maxVerifiedPerCity:1,

    /*
     * Confirmed via live diagnose (Part 5, run 6): the site
     * genuinely doesn't publish an altılı article for every
     * city racing that day (e.g. Ankara + İzmir verified and
     * accepted, Diyarbakır had none) — this is a real, expected
     * per-day coverage gap, not a discovery failure. Without
     * this the all-or-nothing coverage gate discarded verified,
     * accepted candidates entirely and reported "not-published"
     * even though real articles were found. banko_tahminler
     * already sets this for the same reason.
     */
    allowPartialCoverage:true,

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

    browserNavigationBudget:4,

    fallback:"feed"
  });
