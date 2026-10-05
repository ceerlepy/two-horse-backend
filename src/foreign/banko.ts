import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  acquireCfContentHtml
} from "../acquisition/cloudflare-html";

/*
 * Banko Tahminler publishes an "AI tahmin" page per meeting, foreign
 * (YD) cards included, at
 *   /ai-tahmin/<day>-<month name>-<year>-<meeting slug>/
 * e.g. /ai-tahmin/7-nisan-2026-pontefract-birlesik-krallik/.
 *
 * The site answers plain HTTP with a Cloudflare challenge (from the
 * worker too), so the page is fetched through Browser Rendering's
 * content action, the same stage the banko_tahminler expert source
 * already succeeds with. Phase 1 stores the page per foreign meeting
 * (bounded: one row per meeting per day, 3 days kept) so the picks
 * parser can be written against the real markup.
 */
export const BANKO_FOREIGN_CONFIG = {
  pagesPerRun: 2,
  /* A meeting the site does not cover costs at most this many fetches. */
  maxAttempts: 6,
  retryMissingAfterMinutes: 120,
  /* The /ai-tahmin/ listing tells us the real page URLs. */
  indexUrl: "https://www.bankotahminler.com/ai-tahmin/",
  indexRefreshMinutes: 120,
  maxStoredHtmlChars: 150_000,
  retentionDays: 3
} as const;

const MONTHS = [
  "ocak",
  "subat",
  "mart",
  "nisan",
  "mayis",
  "haziran",
  "temmuz",
  "agustos",
  "eylul",
  "ekim",
  "kasim",
  "aralik"
];

export function bankoSlug(
  value: string
): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function bankoAiPageUrl(
  raceDate: string,
  city: string
): string | null {
  const match =
    raceDate.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const day =
    Number(match[3]);

  const month =
    MONTHS[Number(match[2]) - 1];

  return month
    ? `https://www.bankotahminler.com/ai-tahmin/${day}-${month}-${match[1]}-${bankoSlug(city)}/`
    : null;
}

export function pageTitle(
  html: string
): string {
  return (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export type BankoPageStatus =
  | "ok"
  | "missing"
  | "challenge";

export function classifyPage(
  html: string
): BankoPageStatus {
  const title =
    pageTitle(html).toLocaleLowerCase("tr-TR");

  if (/just a moment|attention required|bir dakika/.test(title)) {
    return "challenge";
  }

  if (/sayfa bulunamad|404|not found|bulunamadı/.test(title)) {
    return "missing";
  }

  return "ok";
}

export function isMissingPage(
  html: string
): boolean {
  return classifyPage(html) !== "ok";
}

/*
 * Links on the /ai-tahmin/ listing: href path slug -> absolute URL.
 */
export function bankoIndexLinks(
  html: string
): string[] {
  const links = new Set<string>();
  const pattern =
    /href=["'](?:https?:\/\/(?:www\.)?bankotahminler\.com)?(\/ai-tahmin\/[a-z0-9-]+\/?)["']/gi;

  for (const match of html.matchAll(pattern)) {
    const path =
      match[1].endsWith("/") ? match[1] : `${match[1]}/`;
    links.add(`https://www.bankotahminler.com${path}`);
  }

  return [...links];
}

/*
 * The listing's link for this meeting/date, else the URL the site's
 * own pattern would give.
 */
export function bankoPageUrlFor(
  raceDate: string,
  city: string,
  indexLinks: string[]
): string | null {
  const guessed =
    bankoAiPageUrl(raceDate, city);

  if (!guessed) {
    return null;
  }

  if (indexLinks.includes(guessed)) {
    return guessed;
  }

  const prefix =
    guessed.replace(/[^/]+\/$/, "") +
    guessed.match(/ai-tahmin\/(\d+-[a-z]+-\d{4})-/)?.[1];

  const firstWord =
    bankoSlug(city).split("-")[0];

  return (
    indexLinks.find(
      link =>
        link.startsWith(prefix) &&
        link.includes(`-${firstWord}`)
    ) ?? guessed
  );
}

function compactHtml(
  html: string
): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .slice(
      0,
      BANKO_FOREIGN_CONFIG.maxStoredHtmlChars
    );
}

async function storePage(
  env: Env,
  raceDate: string,
  city: string,
  url: string,
  status: string,
  html: string | null,
  error: string | null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO foreign_expert_pages(
      race_date, city, source_key, url, status, html, error, fetched_at
    )
    VALUES(?, ?, 'banko_tahminler', ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(race_date, city, source_key) DO UPDATE SET
      url = excluded.url,
      status = excluded.status,
      html = COALESCE(excluded.html, foreign_expert_pages.html),
      error = excluded.error,
      attempts = foreign_expert_pages.attempts + 1,
      fetched_at = excluded.fetched_at
  `)
    .bind(raceDate, city, url, status, html, error)
    .run();
}

async function fetchPage(
  env: Env,
  url: string
): Promise<{ status: string; html: string | null; error: string | null }> {
  try {
    const acquired =
      await acquireCfContentHtml(env, url);

    const status =
      classifyPage(acquired.html);

    return status === "ok"
      ? { status, html: compactHtml(acquired.html), error: null }
      : { status, html: null, error: pageTitle(acquired.html).slice(0, 200) };
  } catch (caught) {
    return {
      status: "failed",
      html: null,
      error:
        (caught instanceof Error ? caught.message : String(caught))
          .slice(0, 500)
    };
  }
}

/* Stored under the pseudo-city "_index" for the day. */
async function indexLinksFor(
  env: Env,
  raceDate: string
): Promise<string[]> {
  const row =
    await env.DB.prepare(`
      SELECT status, html,
        fetched_at < datetime('now', ?) AS stale
      FROM foreign_expert_pages
      WHERE race_date = ? AND city = '_index' AND source_key = 'banko_tahminler'
    `)
      .bind(
        `-${BANKO_FOREIGN_CONFIG.indexRefreshMinutes} minutes`,
        raceDate
      )
      .first<any>();

  if (row && !row.stale) {
    return row.html ? bankoIndexLinks(String(row.html)) : [];
  }

  const page =
    await fetchPage(env, BANKO_FOREIGN_CONFIG.indexUrl);

  await storePage(
    env,
    raceDate,
    "_index",
    BANKO_FOREIGN_CONFIG.indexUrl,
    page.status,
    page.html,
    page.error
  );

  const html =
    page.html ?? (row?.html ? String(row.html) : "");

  return html ? bankoIndexLinks(html) : [];
}

const FOREIGN_SLUG =
  /-(fransa|birlesik-krallik|ingiltere|irlanda|abd|guney-afrika|avustralya|malezya|sili|brezilya|arjantin|bae|katar)\/$/;

/*
 * Until one real foreign page has been stored, keep one recent foreign
 * page from the listing as "_sample" (one fetch per day) so the picks
 * parser can be built against real markup even before today's pages
 * are published.
 */
async function captureSampleIfNeeded(
  env: Env,
  raceDate: string,
  indexLinks: string[]
): Promise<void> {
  const existing =
    await env.DB.prepare(`
      SELECT 1 AS found FROM foreign_expert_pages
      WHERE source_key = 'banko_tahminler'
        AND city <> '_index'
        AND status = 'ok'
      LIMIT 1
    `).first<any>();

  const triedToday =
    await env.DB.prepare(`
      SELECT 1 AS found FROM foreign_expert_pages
      WHERE source_key = 'banko_tahminler'
        AND city = '_sample' AND race_date = ?
    `).bind(raceDate).first<any>();

  const sampleUrl =
    indexLinks.find(link => FOREIGN_SLUG.test(link));

  if (existing?.found || triedToday?.found || !sampleUrl) {
    return;
  }

  const page =
    await fetchPage(env, sampleUrl);

  await storePage(
    env,
    raceDate,
    "_sample",
    sampleUrl,
    page.status,
    page.html,
    page.error
  );
}

export async function captureBankoForeignPages(
  env: Env,
  raceDate: string = turkeyDate()
): Promise<{ fetched: string[]; missing: string[]; failed: string[] }> {
  const due =
    (
      await env.DB.prepare(`
        SELECT fm.city
        FROM foreign_meetings fm
        LEFT JOIN foreign_expert_pages p
          ON p.race_date = fm.race_date
          AND p.city = fm.city
          AND p.source_key = 'banko_tahminler'
        WHERE fm.race_date = ?
          AND (
            p.city IS NULL
            OR (
              p.status <> 'ok'
              AND p.attempts < ?
              AND p.fetched_at < datetime('now', ?)
            )
          )
        ORDER BY COALESCE(fm.yd_order, 99)
        LIMIT ?
      `)
        .bind(
          raceDate,
          BANKO_FOREIGN_CONFIG.maxAttempts,
          `-${BANKO_FOREIGN_CONFIG.retryMissingAfterMinutes} minutes`,
          BANKO_FOREIGN_CONFIG.pagesPerRun
        )
        .all<any>()
    ).results ?? [];

  const fetched: string[] = [];
  const missing: string[] = [];
  const failed: string[] = [];

  if (!due.length) {
    return { fetched, missing, failed };
  }

  const indexLinks =
    await indexLinksFor(env, raceDate);

  await captureSampleIfNeeded(env, raceDate, indexLinks);

  for (
    const row of
    due
  ) {
    const city =
      String(row.city);

    const url =
      bankoPageUrlFor(
        raceDate,
        city,
        indexLinks
      );

    if (!url) {
      continue;
    }

    const page =
      await fetchPage(env, url);

    (
      page.status === "ok"
        ? fetched
        : page.status === "failed"
          ? failed
          : missing
    ).push(`${city}:${page.status}`);

    await storePage(
      env,
      raceDate,
      city,
      url,
      page.status,
      page.html,
      page.error
    );
  }

  if (due.length) {
    await env.DB.prepare(`
      DELETE FROM foreign_expert_pages
      WHERE race_date < date(?, ?)
    `)
      .bind(
        raceDate,
        `-${BANKO_FOREIGN_CONFIG.retentionDays} days`
      )
      .run();
  }

  return { fetched, missing, failed };
}
