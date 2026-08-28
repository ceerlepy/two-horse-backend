import {
  createVerifiedArticleAdapter
} from "./verified-article";


const PUBLIC_WRITER =
  "https://www.yarisanalizi.com/yazarlar/yazilari/1/Eyup-CULFA.html";

const LATEST =
  "https://www.yarisanalizi.com/son-tahminler.html";

const ROOT =
  "https://www.yarisanalizi.com/";


function fresh(
  value:string,
  raceDate:string
):string {
  const url =
    new URL(value);

  /*
   * Avoid a stale source/CDN listing while keeping
   * source identity fully dynamic.
   */
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
      decodeURIComponent(
        url.pathname
      )
        .toLowerCase();

    /*
     * PUBLIC Eyup CULFA path only.
     *
     * Do not ingest writer 9 restricted articles when
     * writer 1 has a public article for the same date.
     */
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

    discoveryUrls(
      context
    ) {
      return [
        fresh(
          PUBLIC_WRITER,
          context.raceDate
        ),

        fresh(
          LATEST,
          context.raceDate
        ),

        fresh(
          ROOT,
          context.raceDate
        )
      ];
    },

    /*
     * Never let body/sidebar establish target date.
     * The listing href/title must already match date.
     */
    requireCandidateDateEvidence:
      true,

    maxCandidates:6,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:false,
    allowPuppeteerArticle:false,

    fallback:"legacy"
  });
