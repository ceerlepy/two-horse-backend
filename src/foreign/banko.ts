import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  acquireCfContentHtml
} from "../acquisition/cloudflare-html";

import {
  parseBankoPicks,
  type BankoPicks
} from "./banko-picks";

/*
 * Banko Tahminler publishes an "AI tahmin" post per meeting, foreign
 * (YD) cards included, around 05:25 Turkey time and revises it during
 * the day ("Güncelleme 13:25 ... yeniden oluşturuldu"). Each post holds
 * the site's altılı coupons and a ranked comment per race (see
 * ./banko-picks.ts).
 *
 * The posts are WordPress posts in category 987, so one plain request
 * to the public REST API returns every meeting's post for the day.
 * The HTML pages sit behind a Cloudflare challenge; Browser Rendering
 * is only the fallback, two pages per run.
 */
export const BANKO_FOREIGN_CONFIG = {
  postsUrl: "https://www.bankotahminler.com/wp-json/wp/v2/posts",
  categoryId: 987,
  /* Posts are revised during the day; re-read while races remain. */
  refreshMinutes: 30,
  fallbackPagesPerRun: 2,
  retentionDays: 3
} as const;

const STATE_CITY = "_state";

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

export function bankoPostSlug(
  raceDate: string,
  city: string
): string | null {
  const match =
    raceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  const month =
    match ? MONTHS[Number(match[2]) - 1] : undefined;

  return match && month
    ? `${Number(match[3])}-${month}-${match[1]}-${bankoSlug(city)}`
    : null;
}

export function bankoAiPageUrl(
  raceDate: string,
  city: string
): string | null {
  const slug = bankoPostSlug(raceDate, city);
  return slug
    ? `https://www.bankotahminler.com/ai-tahmin/${slug}/`
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

  if (/sayfa bulunamad|404|not found/.test(title)) {
    return "missing";
  }

  return "ok";
}

function previousDay(
  raceDate: string
): string {
  const date = new Date(`${raceDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/* slug -> rendered post content, for posts published since yesterday noon. */
export async function fetchBankoPosts(
  raceDate: string
): Promise<Map<string, string>> {
  const url =
    `${BANKO_FOREIGN_CONFIG.postsUrl}` +
    `?categories=${BANKO_FOREIGN_CONFIG.categoryId}` +
    `&after=${previousDay(raceDate)}T12:00:00` +
    `&per_page=50&_fields=slug,content`;

  const acquired =
    await acquireHttpHtml(url, { timeoutMs: 15_000, minimumBytes: 2 });

  const posts =
    JSON.parse(acquired.html) as Array<{
      slug?: string;
      content?: { rendered?: string };
    }>;

  const output = new Map<string, string>();

  for (const post of Array.isArray(posts) ? posts : []) {
    if (post.slug && post.content?.rendered) {
      output.set(post.slug, post.content.rendered);
    }
  }

  return output;
}

async function store(
  env: Env,
  raceDate: string,
  city: string,
  url: string,
  status: string,
  picks: BankoPicks | null,
  error: string | null
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO foreign_expert_pages(
      race_date, city, source_key, url, status, html, picks_json, error, fetched_at
    )
    VALUES(?, ?, 'banko_tahminler', ?, ?, NULL, ?, ?, datetime('now'))
    ON CONFLICT(race_date, city, source_key) DO UPDATE SET
      url = excluded.url,
      status = excluded.status,
      html = NULL,
      picks_json = COALESCE(excluded.picks_json, foreign_expert_pages.picks_json),
      error = excluded.error,
      attempts = foreign_expert_pages.attempts + 1,
      fetched_at = excluded.fetched_at
  `)
    .bind(
      raceDate,
      city,
      url,
      status,
      picks ? JSON.stringify(picks) : null,
      error
    )
    .run();
}

function hasPicks(
  picks: BankoPicks
): boolean {
  return picks.coupons.length > 0 || picks.races.some(race => race.ranked.length > 0);
}

export async function captureBankoForeignPages(
  env: Env,
  raceDate: string = turkeyDate()
): Promise<{ stored: string[]; missing: string[]; mode: string }> {
  /* Throttle: one run per refreshMinutes, tracked in a state row. */
  const state =
    await env.DB.prepare(`
      SELECT fetched_at < datetime('now', ?) AS due
      FROM foreign_expert_pages
      WHERE race_date = ? AND city = ? AND source_key = 'banko_tahminler'
    `)
      .bind(`-${BANKO_FOREIGN_CONFIG.refreshMinutes} minutes`, raceDate, STATE_CITY)
      .first<any>();

  if (state && !state.due) {
    return { stored: [], missing: [], mode: "throttled" };
  }

  const meetings =
    (
      await env.DB.prepare(`
        SELECT city, program_json
        FROM foreign_meetings
        WHERE race_date = ?
        ORDER BY COALESCE(yd_order, 99)
      `)
        .bind(raceDate)
        .all<any>()
    ).results ?? [];

  /* Stop once every race of the meeting has started (Turkey time). */
  const nowHm =
    new Date(Date.now() + 3 * 3600_000).toISOString().slice(11, 16);

  const active =
    meetings.filter((meeting: any) => {
      try {
        const races = JSON.parse(String(meeting.program_json)) as Array<{ time: string | null }>;
        return races.some(race => !race.time || race.time > nowHm);
      } catch {
        return true;
      }
    });

  if (!active.length) {
    return { stored: [], missing: [], mode: "no-active-meetings" };
  }

  const stored: string[] = [];
  const missing: string[] = [];
  let mode = "wp-json";
  let posts: Map<string, string> | null = null;
  let postsError: string | null = null;

  try {
    posts = await fetchBankoPosts(raceDate);
  } catch (error) {
    postsError = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    mode = "browser-fallback";
  }

  let fallbackBudget: number =
    BANKO_FOREIGN_CONFIG.fallbackPagesPerRun;

  for (const meeting of active) {
    const city = String(meeting.city);
    const slug = bankoPostSlug(raceDate, city);
    const url = bankoAiPageUrl(raceDate, city);

    if (!slug || !url) {
      continue;
    }

    let html: string | null = posts?.get(slug) ?? null;
    let status = html ? "ok" : "missing";
    let error: string | null = html ? null : postsError ?? "NOT_PUBLISHED";

    if (!posts && fallbackBudget > 0) {
      fallbackBudget--;
      try {
        const page = await acquireCfContentHtml(env, url);
        status = classifyPage(page.html);
        html = status === "ok" ? page.html : null;
        error = status === "ok" ? null : pageTitle(page.html).slice(0, 200);
      } catch (caught) {
        status = "failed";
        error = (caught instanceof Error ? caught.message : String(caught)).slice(0, 300);
      }
    }

    const picks = html ? parseBankoPicks(html) : null;

    if (picks && !hasPicks(picks)) {
      status = "unparsed";
      error = "NO_PICKS_IN_POST";
    }

    (status === "ok" ? stored : missing).push(`${city}:${status}`);

    await store(
      env,
      raceDate,
      city,
      url,
      status,
      status === "ok" ? picks : null,
      error
    );
  }

  await store(
    env,
    raceDate,
    STATE_CITY,
    BANKO_FOREIGN_CONFIG.postsUrl,
    posts ? "ok" : "failed",
    null,
    postsError
  );

  await env.DB.prepare(`
    DELETE FROM foreign_expert_pages
    WHERE race_date < date(?, ?)
  `)
    .bind(raceDate, `-${BANKO_FOREIGN_CONFIG.retentionDays} days`)
    .run();

  return { stored, missing, mode };
}

export async function getBankoForeignPicks(
  env: Env,
  raceDate: string
): Promise<Map<string, BankoPicks>> {
  const rows =
    (
      await env.DB.prepare(`
        SELECT city, picks_json
        FROM foreign_expert_pages
        WHERE race_date = ?
          AND source_key = 'banko_tahminler'
          AND picks_json IS NOT NULL
      `)
        .bind(raceDate)
        .all<any>()
    ).results ?? [];

  const output = new Map<string, BankoPicks>();

  for (const row of rows) {
    try {
      output.set(String(row.city), JSON.parse(String(row.picks_json)));
    } catch {
      // ignore a corrupt row
    }
  }

  return output;
}
