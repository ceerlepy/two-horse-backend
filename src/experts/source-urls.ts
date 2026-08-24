import type {
  ExpertSource
} from "./source-types";


/*
 * Durable entry/current-page URLs.
 *
 * These URLs are discovery/current-page entry points.
 *
 * Dynamically discovered daily article URLs do not belong
 * here.
 */
const VERIFIED_ENTRY_URLS:
  Record<
    string,
    string[]
  > = {

  liderform: [
    /*
     * Verified Liderform analysis category.
     * This is intentionally first because it contains a
     * much cleaner candidate set than the general home
     * page.
     */
    "https://liderform.com.tr/haberler/analizler",

    "https://liderform.com.tr/",
    "https://liderform.com.tr/uzman-listesi/"
  ],

  yaris_dergisi: [
    "https://www.yarisdergisi.com/tag/tahminler/",
    "https://www.yarisdergisi.com/tag/altili-tahmin/",
    "https://www.yarisdergisi.com/"
  ],

  banko_tahminler: [
    "https://www.bankotahminler.com/tahminler/",
    "https://www.bankotahminler.com/bulten/",
    "https://www.bankotahminler.com/"
  ],

  yaris_analizi: [
    "https://www.yarisanalizi.com/yazarlar/yazilari/9/Yaris-Analizi.html",
    "https://www.yarisanalizi.com/"
  ],

  istinye_ganyan: [
    "https://istinyeganyan.com/ganyan/tahminler/",
    "https://istinyeganyan.com/"
  ],

  horseturk: [
    "https://www.horseturk.com/"
  ],

  ganyan_canavari: [
    "https://www.ganyancanavari.com.tr/"
  ],

  afa: [
    "https://atlarafisildayanadam.com/"
  ]
};


function normalizeUrl(
  value:
    string |
    null |
    undefined
): string | null {
  if (!value) {
    return null;
  }


  try {
    const url =
      new URL(
        value
      );


    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }


    url.hash =
      "";


    return url
      .toString();

  } catch {
    return null;
  }
}


function dedupeUrls(
  values:
    Array<
      string |
      null |
      undefined
    >
): string[] {
  const seen =
    new Set<string>();


  const result:
    string[] = [];


  for (
    const raw of
    values
  ) {
    const url =
      normalizeUrl(
        raw
      );


    if (
      !url ||
      seen.has(
        url
      )
    ) {
      continue;
    }


    seen.add(
      url
    );


    result.push(
      url
    );
  }


  return result;
}


export function expertLandingUrls(
  source:
    ExpertSource
): string[] {
  return dedupeUrls([
    ...(
      VERIFIED_ENTRY_URLS[
        source.source_key
      ] ??
      []
    ),

    source.homepage_url
  ]);
}


export function expertUrlCandidates(
  source:
    ExpertSource
): string[] {
  return dedupeUrls([
    source.last_working_url,

    ...expertLandingUrls(
      source
    )
  ]);
}
