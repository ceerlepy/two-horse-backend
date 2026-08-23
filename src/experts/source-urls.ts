import type {
  ExpertSource
} from "./source-types";


/*
 * These are semantic entry points, not acquisition fallbacks.
 *
 * Acquisition fallback already exists in:
 * extractSemanticJson():
 *
 *   CF_JSON(url)
 *   -> CF_SCRAPE(url) -> CF_JSON(html)
 *   -> CF_CONTENT(url) -> CF_JSON(html)
 *
 * This file solves a different problem:
 * choosing the correct CURRENT prediction page/index URL
 * before that acquisition chain runs.
 */
const VERIFIED_ENTRY_URLS:
  Record<string,string[]> = {

  liderform: [
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
  value:string | null | undefined
):string | null {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(value);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    url.hash = "";

    return url.toString();
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


  for (const raw of values) {
    const url =
      normalizeUrl(raw);


    if (
      !url ||
      seen.has(url)
    ) {
      continue;
    }


    seen.add(url);

    result.push(url);
  }


  return result;
}


/*
 * Durable discovery/current-page entry points.
 *
 * A dynamically discovered daily article is intentionally
 * NOT part of this set.
 */
export function expertLandingUrls(
  source:
    ExpertSource
): string[] {
  return dedupeUrls([
    ...(
      VERIFIED_ENTRY_URLS[
        source.source_key
      ] ?? []
    ),

    source.homepage_url
  ]);
}


/*
 * Full routing order.
 *
 * last_working_url stays first for same-day/stable-page
 * cache reuse.
 *
 * service.ts decides whether that working URL is eligible
 * for reuse on the current Turkey date.
 */
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
