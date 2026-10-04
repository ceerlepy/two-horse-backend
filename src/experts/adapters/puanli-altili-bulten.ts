import * as cheerio from "cheerio";

import {
  acquireHttpHtml
} from "../../acquisition/http";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import type {
  RawExpertExtraction,
  RawExpertRace
} from "../raw-extraction";

import {
  cityScopedTarget
} from "./target-scope";

import type {
  ExpertAdapter,
  ExpertAdapterContext,
  ExpertTargetResolution
} from "./types";


/*
 * Puanlı Altılı Bülten moved from puanlialtilibulten.com (dead) to
 * Blogger. Every meeting gets one free post titled
 *   "<City> - DD.MM.YYYY - <Weekday> - Altılı Bülten"
 * with one HTML table per race: B.Puan (score), "<no> <NAME> <gear>",
 * age, weight, jockey, start, HK. The site's sibling "Accurace
 * Geçmiş Veri Analizi" posts carry no scores and are ignored.
 *
 * The table is fully structured, so picks are read deterministically
 * (no Workers AI): per race, the highest score is the favourite and
 * the next two are rivals.
 */
export const PUANLI_BULTEN_ROOT =
  "https://puanlialtilibulten.blogspot.com/";

const FEED_URL =
  PUANLI_BULTEN_ROOT +
  "feeds/posts/summary?alt=json&max-results=40";

const HOST =
  "puanlialtilibulten.blogspot.com";

const TITLE_RE =
  /^(.+?)\s+-\s+(\d{2})\.(\d{2})\.(\d{4})\s+-\s+[^-]+-\s+Altılı\s+Bülten\s*$/iu;


export interface PuanliFeedPost {
  title: string;
  url: string;
}


export function matchPuanliPosts(
  posts: PuanliFeedPost[],
  raceDate: string,
  cities: string[]
): Array<{ city: string; url: string }> {
  const out: Array<{ city: string; url: string }> = [];
  const seen = new Set<string>();

  for (const post of posts) {
    const match = TITLE_RE.exec(post.title.trim());
    if (!match) continue;

    const [, cityLabel, dd, mm, yyyy] = match;
    if (`${yyyy}-${mm}-${dd}` !== raceDate) continue;

    const city = cities.find(
      candidate =>
        normalizeExpertSearchText(candidate) ===
        normalizeExpertSearchText(cityLabel)
    );

    if (!city || seen.has(city)) continue;
    seen.add(city);
    out.push({ city, url: post.url });
  }

  return out;
}


function feedPosts(json: any): PuanliFeedPost[] {
  const entries = json?.feed?.entry;
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry: any) => ({
      title: String(entry?.title?.$t ?? ""),
      url: String(
        (entry?.link ?? []).find((l: any) => l?.rel === "alternate")?.href ?? ""
      )
    }))
    .filter((post: PuanliFeedPost) => post.title && post.url.startsWith(PUANLI_BULTEN_ROOT));
}


async function resolve(
  context: ExpertAdapterContext
): Promise<ExpertTargetResolution> {
  const diagnostics: Record<string, unknown> = { feed: FEED_URL };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let json: any;
    try {
      const response = await fetch(FEED_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      json = await response.json();
    } finally {
      clearTimeout(timer);
    }

    const posts = feedPosts(json);
    const matched = matchPuanliPosts(posts, context.raceDate, context.cities);
    diagnostics.postCount = posts.length;
    diagnostics.matched = matched;

    if (!matched.length) {
      return {
        status: "not-published",
        mode: "article",
        targets: [],
        discoveredFromUrl: FEED_URL,
        discoveryMethod: "blogger-feed",
        diagnostics
      };
    }

    return {
      status: "ready",
      mode: "article",
      targets: matched.map(m => cityScopedTarget(m.url, m.city)),
      discoveredFromUrl: FEED_URL,
      discoveryMethod: "blogger-feed",
      diagnostics
    };
  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message : String(error);
    return {
      status: "unavailable",
      mode: "article",
      targets: [],
      discoveredFromUrl: FEED_URL,
      discoveryMethod: "blogger-feed",
      diagnostics
    };
  }
}


function ownsPost(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === HOST && /\/\d{4}\/\d{2}\/.+\.html$/.test(url.pathname);
  } catch {
    return false;
  }
}


/* TJK gear codes the site appends to the horse name. */
const GEAR_TOKENS = new Set([
  "K", "KG", "SK", "SKG", "DB", "SGKR", "GKR", "BB", "YP", "ÖG", "KK", "TK", "BK", "GK", "SGK"
]);


function isGearToken(token: string): boolean {
  const upper = token.toLocaleUpperCase("tr-TR");
  return (
    GEAR_TOKENS.has(upper) ||
    upper.includes("%") ||
    upper.includes("EKÜRİ") ||
    /^(?:KG|DB|SKG|SK|K)J/.test(upper)
  );
}


/*
 * The name cell is "<NAME> <gear codes> [<apprentice/ekürİ marks>]",
 * e.g. "SEN PINARSIN KG DB SK SGKR", "ÜMİTBEY KG KJ%23",
 * "GOLDEN RACER KG DB SKEKÜRİ A". Cut at the first gear-like token.
 */
export function cleanPuanliHorseName(value: string): string {
  const tokens = value.replace(/\s+/g, " ").trim().split(" ");
  const cut = tokens.findIndex((token, index) => index > 0 && isGearToken(token));
  return (cut > 0 ? tokens.slice(0, cut) : tokens).join(" ");
}


export function parsePuanliBulten(
  html: string,
  city: string
): RawExpertExtraction {
  const $ = cheerio.load(html);
  const races: RawExpertRace[] = [];

  $("table").each((_, table) => {
    const header = $(table).find("tr.bas").first().text().replace(/\s+/g, " ").trim();
    const raceMatch = /^(\d{1,2})\s*\.\s*KOŞU/iu.exec(header);
    if (!raceMatch) return;

    const scored: Array<{ score: number; horseNumber: number; horseName: string }> = [];

    $(table).find("tr").each((__, row) => {
      const score = Number($(row).find("td.puan").text().trim());
      const atText = $(row).find("td.at").text().replace(/\s+/g, " ").trim();
      const horse = /^(\d{1,2})\s+(.+)$/.exec(atText);
      if (!Number.isFinite(score) || !horse) return;
      scored.push({
        score,
        horseNumber: Number(horse[1]),
        horseName: cleanPuanliHorseName(horse[2])
      });
    });

    if (scored.length < 2) return;
    scored.sort((a, b) => b.score - a.score || a.horseNumber - b.horseNumber);

    races.push({
      city,
      raceNumber: Number(raceMatch[1]),
      selections: scored.slice(0, 3).map((horse, index) => ({
        horseNumber: horse.horseNumber,
        horseName: horse.horseName,
        comment: `B.Puan ${horse.score}`,
        labels: [index === 0 ? "favorite" : "rival"]
      })),
      numberGroups: []
    });
  });

  return { races };
}


export const puanliAltiliBultenAdapter: ExpertAdapter = {
  sourceKey: "puanli_altili_bulten",

  resolve,

  ownsAcquisition: ownsPost,

  async acquireHtml(context) {
    const url = new URL(context.url);
    url.hash = "";
    return acquireHttpHtml(url.toString(), { timeoutMs: 15_000 });
  }
};
