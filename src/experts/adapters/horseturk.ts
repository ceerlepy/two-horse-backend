import {
  createVerifiedArticleAdapter
} from "./verified-article";

import {
  dateSearchText,
  raceDateParts,
  simpleSlug,
  wordpressSearchUrl
} from "./article-url-utils";


const ROOT =
  "https://www.horseturk.com/";

const CATEGORY =
  "https://www.horseturk.com/cat/at-yarisi-tahminleri/";


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
        "horseturk.com" &&
      path !== "/" &&
      !path.startsWith(
        "/cat/"
      ) &&
      (
        path.includes(
          "tahmin"
        ) ||
        path.includes(
          "altili-ganyan"
        )
      )
    );

  } catch {
    return false;
  }
}


export const horseturkAdapter =
  createVerifiedArticleAdapter({
    sourceKey:
      "horseturk",

    sourceName:
      "HorseTurk",

    ownsArticle,

    directCandidates(
      context
    ) {
      const parts =
        raceDateParts(
          context.raceDate
        );

      return context.cities
        .map(
          city => ({
            city,

            url:
              new URL(
                [
                  "at-yarisi-tahminleri",
                  simpleSlug(city),
                  parts.day,
                  parts.monthSlug,
                  parts.year
                ]
                  .join("-") +
                  "/",
                ROOT
              )
                .toString()
          })
        );
    },

    discoveryUrls(
      context
    ) {
      return [
        CATEGORY,

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

    maxCandidates:6,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:false,
    allowPuppeteerArticle:false,

    fallback:"legacy"
  });
