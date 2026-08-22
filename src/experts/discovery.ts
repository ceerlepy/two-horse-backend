import type {
  Env
} from "../env";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

import {
  acquireCfContentHtml,
  acquireCfScrapeHtml
} from "../acquisition/cloudflare-html";

import {
  turkeyDate
} from "../shared";


const discoverySchema = {
  type: "object",

  properties: {
    urls: {
      type: "array",

      items: {
        type: "string"
      }
    }
  },

  required: [
    "urls"
  ]
} as const;


/*
 * Discovery is intentionally HYBRID:
 *
 * 1. deterministic rendered HTML link discovery
 *    SCRAPE -> href parser
 *
 * 2. deterministic rendered HTML fallback
 *    CONTENT -> href parser
 *
 * 3. semantic AI fallback
 *    extractSemanticJson()
 *
 * Extraction of picks is NOT handled here.
 */


function sameHost(
  a: string,
  b: string
): boolean {
  try {
    return (
      new URL(a).hostname
        .replace(/^www\./,"") ===
      new URL(b).hostname
        .replace(/^www\./,"")
    );
  } catch {
    return false;
  }
}


function normalizeUrl(
  base: string,
  value: string
): string | null {
  try {
    const url =
      new URL(
        value,
        base
      );

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


/*
 * Turkish-safe-ish comparison representation.
 *
 * We do NOT use this value as identity.
 * It is only discovery ranking.
 */
function fold(
  value: string
): string {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g,"i")
    .replace(/ğ/g,"g")
    .replace(/ü/g,"u")
    .replace(/ş/g,"s")
    .replace(/ö/g,"o")
    .replace(/ç/g,"c")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}


function stripTags(
  value: string
): string {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g," ")
    .trim();
}


interface HtmlLink {
  url: string;
  text: string;
}


function extractLinks(
  baseUrl: string,
  html: string
): HtmlLink[] {
  const output:
    HtmlLink[] = [];

  const seen =
    new Set<string>();

  /*
   * We only need anchors, not a full DOM implementation.
   * The Browser Run HTML is already rendered.
   */
  const anchorRegex =
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

  let match:
    RegExpExecArray | null;

  while (
    (
      match =
        anchorRegex.exec(html)
    ) !== null
  ) {
    const url =
      normalizeUrl(
        baseUrl,
        match[2]
      );

    if (
      !url ||
      !sameHost(
        baseUrl,
        url
      ) ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);

    output.push({
      url,
      text:
        stripTags(
          match[3]
        )
    });
  }

  return output;
}


function dateSignals(
  date: string
): string[] {
  const [
    year,
    month,
    day
  ] =
    date.split("-");

  return [
    date,
    `${day}-${month}-${year}`,
    `${day}.${month}.${year}`,
    `${day}/${month}/${year}`,
    `${day}${month}${year}`,
    `${year}${month}${day}`,

    /*
     * Common compact slugs:
     * 22-8-2026 / 22.8.2026 etc.
     */
    `${Number(day)}-${Number(month)}-${year}`,
    `${Number(day)}.${Number(month)}.${year}`,
    `${Number(day)}/${Number(month)}/${year}`
  ]
    .map(fold);
}


const ARTICLE_WORDS = [
  "tahmin",
  "tahminler",
  "analiz",
  "yorum",
  "yorumlar",
  "altili",
  "ganyan",
  "kosu",
  "kosular",
  "yaris",
  "banko",
  "favori",
  "surpriz",
  "haber"
];


const BAD_PATH_WORDS = [
  "/tag/",
  "/kategori/",
  "/category/",
  "/author/",
  "/yazarlar/",
  "/uzman-listesi",
  "/experts",
  "/login",
  "/register",
  "/iletisim",
  "/contact",
  "/hakkimizda",
  "/about",
  "/privacy",
  "/gizlilik"
];


const ASSET_EXTENSIONS =
  /\.(?:jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js)(?:\?|$)/i;


function rankCandidate(
  landingUrl: string,
  link: HtmlLink,
  date: string,
  cities: string[]
): number {
  let score = 0;

  const urlFolded =
    fold(link.url);

  const textFolded =
    fold(link.text);

  const combined =
    `${urlFolded} ${textFolded}`;

  const landingNormalized =
    normalizeUrl(
      landingUrl,
      landingUrl
    );

  if (
    landingNormalized &&
    link.url === landingNormalized
  ) {
    return -100;
  }

  if (
    ASSET_EXTENSIONS.test(
      link.url
    )
  ) {
    return -100;
  }

  const pathname =
    (() => {
      try {
        return new URL(
          link.url
        ).pathname.toLowerCase();
      } catch {
        return "";
      }
    })();

  if (
    BAD_PATH_WORDS.some(
      word =>
        pathname.includes(word)
    )
  ) {
    score -= 4;
  }


  /*
   * City is the strongest generic current-card signal.
   * One article may contain multiple cities.
   */
  let cityMatches = 0;

  for (const city of cities) {
    const cityFolded =
      fold(city);

    if (
      cityFolded &&
      combined.includes(
        cityFolded
      )
    ) {
      cityMatches += 1;
    }
  }

  if (cityMatches > 0) {
    score += 4;
    score += Math.min(
      cityMatches - 1,
      2
    );
  }


  /*
   * Prediction/article vocabulary.
   */
  const wordMatches =
    ARTICLE_WORDS.filter(
      word =>
        combined.includes(word)
    ).length;

  if (wordMatches > 0) {
    score += 3;
    score += Math.min(
      wordMatches - 1,
      2
    );
  }


  /*
   * Exact/recognisable date is useful, but NOT required.
   * Some publishers use opaque or malformed slugs.
   */
  if (
    dateSignals(date)
      .some(
        signal =>
          signal &&
          combined.includes(
            signal
          )
      )
  ) {
    score += 4;
  }


  /*
   * Generic article-like path signals.
   */
  if (
    /\/(?:haber|haberler|article|post|yazi|yazilar|tahmin|ai-tahmin)\b/i
      .test(pathname)
  ) {
    score += 2;
  }


  /*
   * Real article links normally have a meaningful slug.
   */
  const segments =
    pathname
      .split("/")
      .filter(Boolean);

  if (
    segments.length >= 2 &&
    pathname.length >= 20
  ) {
    score += 1;
  }


  return score;
}


function deterministicCandidates(
  landingUrl: string,
  html: string,
  date: string,
  cities: string[]
): string[] {
  const ranked =
    extractLinks(
      landingUrl,
      html
    )
      .map(
        link => ({
          ...link,

          score:
            rankCandidate(
              landingUrl,
              link,
              date,
              cities
            )
        })
      )

      /*
       * Require multiple independent article signals.
       *
       * We intentionally do NOT require a date in the URL.
       * Final TJK canonical validation remains authoritative.
       */
      .filter(
        item =>
          item.score >= 5
      )

      .sort(
        (a,b) =>
          b.score - a.score
      );


  const output:
    string[] = [];

  const seen =
    new Set<string>();

  for (const item of ranked) {
    if (
      seen.has(item.url)
    ) {
      continue;
    }

    seen.add(item.url);
    output.push(item.url);

    if (
      output.length >= 12
    ) {
      break;
    }
  }

  return output;
}


function normalizeSemanticUrls(
  landingUrl: string,
  values: unknown[]
): string[] {
  const output:
    string[] = [];

  const seen =
    new Set<string>();

  for (const item of values) {
    const url =
      normalizeUrl(
        landingUrl,
        String(item)
      );

    if (
      !url ||
      !sameHost(
        landingUrl,
        url
      ) ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);
    output.push(url);
  }

  return output.slice(0,12);
}


export async function discoverExpertArticleUrls(
  env: Env,
  landingUrl: string,
  sourceName: string,
  cities: string[]
): Promise<{
  urls: string[];
  method: string;
  diagnostics: unknown;
}> {
  const date =
    turkeyDate();

  const diagnostics:
    any = {
      deterministic: [],
      semantic:
        null
    };


  /*
   * ------------------------------------------------------
   * STAGE 1 — SCRAPE + deterministic href parsing
   * ------------------------------------------------------
   */
  try {
    const scraped =
      await acquireCfScrapeHtml(
        env,
        landingUrl
      );

    const urls =
      deterministicCandidates(
        landingUrl,
        scraped.html,
        date,
        cities
      );

    diagnostics.deterministic.push({
      stage:
        "cf-scrape-href",

      bodyLength:
        scraped.bodyLength,

      discovered:
        urls.length,

      urls
    });

    if (urls.length > 0) {
      return {
        urls,
        method:
          "cf-scrape-href",
        diagnostics
      };
    }

  } catch (error) {
    diagnostics.deterministic.push({
      stage:
        "cf-scrape-href",

      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }


  /*
   * ------------------------------------------------------
   * STAGE 2 — CONTENT + deterministic href parsing
   * ------------------------------------------------------
   */
  try {
    const content =
      await acquireCfContentHtml(
        env,
        landingUrl
      );

    const urls =
      deterministicCandidates(
        landingUrl,
        content.html,
        date,
        cities
      );

    diagnostics.deterministic.push({
      stage:
        "cf-content-href",

      bodyLength:
        content.bodyLength,

      discovered:
        urls.length,

      urls
    });

    if (urls.length > 0) {
      return {
        urls,
        method:
          "cf-content-href",
        diagnostics
      };
    }

  } catch (error) {
    diagnostics.deterministic.push({
      stage:
        "cf-content-href",

      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }


  /*
   * ------------------------------------------------------
   * STAGE 3 — existing semantic JSON discovery fallback
   * ------------------------------------------------------
   *
   * AI remains useful when the publisher does not expose
   * conventional anchors or uses unusual rendered markup.
   */
  const prompt = `
${sourceName} sitesinde ${date} tarihine ait Türkiye at yarışı tahmin yazılarının URL adreslerini bul.

HEDEF ŞEHİRLER:
${cities.join(", ")}

Bu sayfa bir ana sayfa, kategori, etiket, uzman listesi veya arşiv sayfası olabilir.

Yalnızca:
- ${date} tarihli,
- Türkiye yarışlarına ait,
- hedef şehirlerden en az birine ait,
- gerçek tahmin/yorum makalesine götüren
URL'leri urls listesine koy.

Makale olmayan kategori, ana sayfa, reklam, sosyal medya, yurt dışı yarış ve eski tarih linklerini alma.

Göreli link varsa tam URL olarak çöz.

Hiç uygun makale yoksa urls boş array olsun.
`.trim();


  const result =
    await extractSemanticJson<any>(
      env,
      landingUrl,
      prompt,
      {
        type:
          "json_schema",

        json_schema:
          discoverySchema
      }
    );


  const raw =
    Array.isArray(
      result.value?.urls
    )
      ? result.value.urls
      : [];


  const urls =
    normalizeSemanticUrls(
      landingUrl,
      raw
    );


  diagnostics.semantic = {
    method:
      result.method,

    discovered:
      urls.length,

    urls,

    acquisition:
      result.diagnostics
  };


  return {
    urls,

    method:
      result.method,

    diagnostics
  };
}
