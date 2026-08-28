import {
  createVerifiedArticleAdapter
} from "./verified-article";


const PUBLIC_WRITER =
  "https://www.yarisanalizi.com/yazarlar/yazilari/1/Eyup-CULFA.html";

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
        "/yazarlar/yazilari/1/"
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
        PUBLIC_WRITER,
        LATEST,
        ROOT
      ];
    },

    requireCandidateDateEvidence:
      true,

    maxCandidates:6,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:false,
    allowPuppeteerArticle:false,

    fallback:"legacy"
  });
