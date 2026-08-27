import {
  createVerifiedArticleAdapter
} from "./verified-article";


const ANALYSES =
  "https://liderform.com.tr/haberler/analizler";

const ROOT =
  "https://liderform.com.tr/";


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
        "liderform.com.tr" &&
      path.startsWith(
        "/haberler/"
      ) &&
      path !==
        "/haberler/analizler"
    );

  } catch {
    return false;
  }
}


export const liderformAdapter =
  createVerifiedArticleAdapter({
    sourceKey:
      "liderform",

    sourceName:
      "Liderform",

    ownsArticle,

    discoveryUrls() {
      return [
        ANALYSES,
        ROOT
      ];
    },

    negativeTerms:[
      "takip edilmesi gereken safkanlar"
    ],

    maxCandidates:8,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:false,
    allowPuppeteerArticle:false,

    fallback:"legacy"
  });
