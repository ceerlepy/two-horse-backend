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
  maxAttempts: 4,
  retryMissingAfterMinutes: 180,
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

export function isMissingPage(
  html: string
): boolean {
  const title =
    (html.match(/<title[^>]*>([^<]*)/i)?.[1] ?? "")
      .toLocaleLowerCase("tr-TR");

  return (
    /sayfa bulunamad|404|not found/.test(title) ||
    /just a moment/.test(title)
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

  for (
    const row of
    due
  ) {
    const city =
      String(row.city);

    const url =
      bankoAiPageUrl(
        raceDate,
        city
      );

    if (!url) {
      continue;
    }

    let status = "ok";
    let html: string | null = null;
    let error: string | null = null;

    try {
      const acquired =
        await acquireCfContentHtml(
          env,
          url
        );

      if (isMissingPage(acquired.html)) {
        status = "missing";
        missing.push(city);
      } else {
        html = compactHtml(acquired.html);
        fetched.push(city);
      }
    } catch (caught) {
      status = "failed";
      error =
        (caught instanceof Error ? caught.message : String(caught))
          .slice(0, 500);
      failed.push(city);
    }

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
