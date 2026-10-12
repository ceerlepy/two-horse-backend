import { describe, expect, it } from "vitest";

import {
  articlePublishedDate,
  headingWeekdayMatches,
  publishedForRaceDay
} from "../src/experts/published-date";

const page = (meta: string) =>
  `<html><head>${meta}</head><body><h1>x</h1></body></html>`;

describe("article publish date", () => {
  it("reads article:published_time in Turkey time", () => {
    expect(
      articlePublishedDate(
        page('<meta property="article:published_time" content="2026-10-11T22:30:00+00:00">')
      )
    ).toBe("2026-10-12");
  });

  it("reads JSON-LD datePublished", () => {
    expect(
      articlePublishedDate(
        page('<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-11T18:00:00+03:00"}</script>')
      )
    ).toBe("2026-10-11");
  });

  it("returns null without metadata", () => {
    expect(articlePublishedDate(page(""))).toBeNull();
  });

  it("tells Pazar from Pazartesi and Cuma from Cumartesi", () => {
    expect(headingWeekdayMatches("Pazartesi Bursa 3.6.8. Koşuların analizi", "2026-10-12")).toBe(true);
    expect(headingWeekdayMatches("Pazar Bursa analizi", "2026-10-12")).toBe(false);
    expect(headingWeekdayMatches("Cumartesi İstanbul analizi", "2026-10-09")).toBe(false);
    expect(headingWeekdayMatches("Cuma günü İstanbul’da 5.6.9.", "2026-10-09")).toBe(true);
  });

  it("accepts this week's weekday article and rejects last week's", () => {
    const heading = "Pazartesi Bursa 3.6.8. ve Şanlıurfa’da 4.5.9. Koşuların analizi";
    const thisWeek = page('<meta property="article:published_time" content="2026-10-11T17:00:00+03:00">');
    const lastWeek = page('<meta property="article:published_time" content="2026-10-04T17:00:00+03:00">');

    expect(publishedForRaceDay(thisWeek, heading, "2026-10-12").accepted).toBe(true);
    expect(publishedForRaceDay(lastWeek, heading, "2026-10-12").accepted).toBe(false);
    expect(publishedForRaceDay(page(""), heading, "2026-10-12").accepted).toBe(false);
  });

  it("rejects a matching date with the wrong weekday in the title", () => {
    const html = page('<meta property="article:published_time" content="2026-10-12T08:00:00+03:00">');
    expect(publishedForRaceDay(html, "Salı Bursa analizi", "2026-10-12").accepted).toBe(false);
  });
});
