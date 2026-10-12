import {
  load
} from "cheerio";

import {
  normalizeExpertSearchText
} from "./text-normalization";

/*
 * Some sources title an article with the weekday only ("Pazartesi
 * Bursa 3.6.8. ... analizi") and never print the date in its body,
 * so the date check rejected every one of them. The page still
 * carries its own publish time in standard metadata; together with a
 * weekday that matches the race day it pins the article to this
 * week's card, while last week's "Pazartesi" article (published
 * seven days earlier) stays rejected.
 */

const TURKEY_OFFSET_MS =
  3 * 60 * 60 * 1000;

/* An article may go up the evening before, or two days ahead. */
const MAX_DAYS_BEFORE_RACE = 2;

const WEEKDAYS = [
  "pazar",
  "pazartesi",
  "sali",
  "carsamba",
  "persembe",
  "cuma",
  "cumartesi"
];


function turkeyDateOf(
  value: string
): string | null {
  const trimmed =
    value.trim();

  /* A bare date carries no time zone; take it as written. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const millis =
    Date.parse(trimmed);

  if (!Number.isFinite(millis)) {
    return null;
  }

  return new Date(
    millis + TURKEY_OFFSET_MS
  )
    .toISOString()
    .slice(0, 10);
}


function jsonLdDatePublished(
  raw: string
): string | null {
  const match =
    raw.match(
      /"datePublished"\s*:\s*"([^"]+)"/
    );

  return match?.[1] ?? null;
}


/* The page's own publish date (Turkey calendar day), or null. */
export function articlePublishedDate(
  html: string
): string | null {
  const $ =
    load(html);

  const candidates = [
    $('meta[property="article:published_time"]').attr("content"),
    $('meta[itemprop="datePublished"]').attr("content"),
    $('meta[name="pubdate"]').attr("content"),
    $('meta[name="publish-date"]').attr("content"),
    ...$('script[type="application/ld+json"]')
      .toArray()
      .map(element => jsonLdDatePublished($(element).text())),
    $("time[datetime]").first().attr("datetime")
  ];

  for (const candidate of candidates) {
    const date =
      candidate
        ? turkeyDateOf(candidate)
        : null;

    if (date) {
      return date;
    }
  }

  return null;
}


export function headingWeekdayMatches(
  heading: string,
  raceDate: string
): boolean {
  const words =
    new Set(
      normalizeExpertSearchText(heading)
        .split(" ")
    );

  const raceWeekday =
    WEEKDAYS[
      new Date(`${raceDate}T12:00:00Z`).getUTCDay()
    ];

  return words.has(raceWeekday);
}


function daysBetween(
  from: string,
  to: string
): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) -
      Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  );
}


/*
 * True only when the heading names the race day's weekday and the
 * page says it was published on the race day or up to two days before.
 */
export function publishedForRaceDay(
  html: string,
  heading: string,
  raceDate: string
): { accepted: boolean; publishedDate: string | null } {
  const publishedDate =
    articlePublishedDate(html);

  if (!publishedDate) {
    return { accepted: false, publishedDate };
  }

  const lead =
    daysBetween(
      publishedDate,
      raceDate
    );

  return {
    accepted:
      lead >= 0 &&
      lead <= MAX_DAYS_BEFORE_RACE &&
      headingWeekdayMatches(heading, raceDate),
    publishedDate
  };
}
