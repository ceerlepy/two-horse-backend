import * as cheerio from "cheerio";

import {
  acquireHttpHtml
} from "../acquisition/http";


/*
 * TJK's own site already carries the data this needs: the horse-name
 * link on the daily program page (captured as runners.horse_profile_url
 * during the normal TJK parse -- see html-parser.ts's anchorHref on
 * the name cell) points at that horse's AtKosuBilgileri page, a full
 * past-race history table. Each row that ran has a "videoAnchor" link
 * (/Info/YarisVideoAt/At?AtKodu=..&KosuKodu=..) next to it. So this
 * needs exactly one fetch -- the already-known profile URL -- not a
 * two-step "find the archive link, then fetch it" dance; a predecessor
 * app (horsai, package com.yarisradar.app) did that two-hop against an
 * older TJK layout where the YarisVideoAt link lived on a separate
 * page, but that layout is gone as of this writing.
 */
export const HORSE_VIDEO_CONFIG = {
  cacheTtlHours: 12,
  fetchTimeoutMs: 8_000,
  maxVideos: 3,
  allowedHost: "www.tjk.org"
} as const;


export interface HorseRaceVideo {
  label: string;
  url: string;
}


function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


export function isAllowedTjkUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.toLowerCase() === HORSE_VIDEO_CONFIG.allowedHost
    );
  } catch {
    return false;
  }
}


const DATE_RE = /\b(\d{2})[./](\d{2})[./](\d{4})\b/;

function rowLabel(
  $: cheerio.CheerioAPI,
  row: cheerio.Cheerio<any>
): string {
  const cells = row.find("td");
  const date = clean(cells.eq(0).text());
  const city = clean(cells.eq(1).text());
  return [date, city].filter(Boolean).join(" ");
}


export function extractArchiveLinks(
  html: string,
  baseUrl: string
): HorseRaceVideo[] {
  const $ = cheerio.load(html);
  const links: HorseRaceVideo[] = [];

  $("a[href*='YarisVideoAt']").each((_, element) => {
    const raw = $(element).attr("href");
    if (!raw) return;

    let absolute: string;
    try {
      absolute = new URL(raw, baseUrl).toString();
    } catch {
      return;
    }

    if (!/KosuKodu/i.test(absolute)) return;

    const row = $(element).closest("tr");
    const label =
      row.length
        ? rowLabel($, row)
        : clean($(element).closest("td").text());

    if (!DATE_RE.test(label)) return;

    links.push({ label, url: absolute });
  });

  const seen = new Set<string>();
  return links.filter(v => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });
}


export function videoDate(video: HorseRaceVideo): number {
  const match = DATE_RE.exec(video.label);
  if (!match) return 0;

  const [, dd, mm, yyyy] = match;
  const time = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  return Number.isFinite(time) ? time : 0;
}


export function selectLast3(
  links: HorseRaceVideo[]
): HorseRaceVideo[] {
  const seenKey = new Set<string>();

  return links
    /*
     * A scratched/did-not-run entry can still carry a stale video
     * anchor in some TJK rows; that is not a real race to surface.
     */
    .filter(v => !/Koşmaz/i.test(v.label))
    .sort((a, b) => videoDate(b) - videoDate(a))
    .filter(v => {
      const key = DATE_RE.exec(v.label)?.[0] ?? v.url;
      if (seenKey.has(key)) return false;
      seenKey.add(key);
      return true;
    })
    .slice(0, HORSE_VIDEO_CONFIG.maxVideos);
}


export async function fetchLast3HorseVideos(
  detailUrl: string
): Promise<HorseRaceVideo[]> {
  if (!isAllowedTjkUrl(detailUrl)) return [];

  const acquired =
    await acquireHttpHtml(
      detailUrl,
      { timeoutMs: HORSE_VIDEO_CONFIG.fetchTimeoutMs }
    ).catch(() => null);

  if (!acquired) return [];

  const links = extractArchiveLinks(acquired.html, detailUrl);
  return selectLast3(links);
}
