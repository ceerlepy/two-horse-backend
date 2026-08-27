import {
  createVerifiedArticleAdapter
} from "./verified-article";


const WRITER =
  "https://www.yarisanalizi.com/yazarlar/yazilari/9/Yaris-Analizi.html";

const LATEST =
  "https://www.yarisanalizi.com/son-tahminler.html";

const ROOT =
  "https://www.yarisanalizi.com/";


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
      decodeURIComponent(
        url.pathname
      )
        .toLowerCase();

    return (
      host ===
        "yarisanalizi.com" &&
      path.includes(
        "/yazarlar/yazilari/9/"
      ) &&
      path.includes(
        "/guncel-at-yaris-tahminleri/"
      )
    );

  } catch {
    return false;
  }
}


export const yarisAnaliziAdapter =
  createVerifiedArticleAdapter({
    sourceKey:
      "yaris_analizi",

    sourceName:
      "Yarış Analizi",

    ownsArticle,

    discoveryUrls() {
      return [
        WRITER,
        LATEST,
        ROOT
      ];
    },

    maxCandidates:6,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:false,
    allowPuppeteerArticle:false,

    fallback:"legacy"
  });
