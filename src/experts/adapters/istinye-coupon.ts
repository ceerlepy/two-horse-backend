import * as cheerio from "cheerio";

import type {
  RawExpertExtraction,
  RawExpertRace,
  RawExpertSelection
} from "../raw-extraction";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  raceDateParts
} from "./article-url-utils";


/*
 * İstinye Ganyan's "tahminler" page carries one long post per city
 * ("06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ"), each holding
 * several in-house tipsters' prose plus their Altılı coupons:
 *
 *   1. Altılı Ganyan
 *   1. Koşu: 1-3-9
 *   ...
 *   2. Altılı Ganyan
 *   3. Koşu: 1-3-6-9
 *
 * Sending the whole page (two cities, ~50k characters) to Workers
 * AI timed out (3046), so the coupons are read directly instead.
 * Coupon lines use official race numbers. Each tipster's two
 * coupons count once per race; a horse earns 1/legSize from every
 * tipster that writes it, so a "tek" counts fully and an
 * all-runners leg barely counts. The top horse of each race is the
 * source's favourite (banko when at least half the tipsters wrote
 * it alone); the next horses holding at least half the top score
 * become rivals, at most two. Up to three horses tied at the top are
 * all strong; a wider tie carries no pick.
 */

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


const MAX_RIVALS = 2;


function postText(
  $:cheerio.CheerioAPI,
  node:ReturnType<cheerio.CheerioAPI>
):string {
  node.find("script,style,noscript").remove();
  node.find("br").replaceWith("\n");
  node.find("p,div,h1,h2,h3,h4,li").each(
    (_index, element) => {
      $(element).append("\n");
    }
  );

  return node
    .text()
    .replace(/ /g," ")
    .replace(/[ \t\r]+/g," ");
}


export function istinyeTitleMatches(
  title:string,
  raceDate:string,
  city:string
):boolean {
  const normalized =
    normalizeExpertSearchText(title);

  const match =
    /^(\d{1,2}) (\p{L}+) /u.exec(
      normalized
    );

  if (!match) {
    return false;
  }

  const parts =
    raceDateParts(raceDate);

  return (
    Number(match[1]) ===
      parts.day &&
    MONTHS.indexOf(match[2]) + 1 ===
      parts.month &&
    ` ${normalized} `.includes(
      ` ${normalizeExpertSearchText(city)} `
    )
  );
}


/*
 * Every tipster's coupon as race -> horse numbers. A "1. Altılı
 * Ganyan" line opens a new tipster; "2. Altılı Ganyan" continues it.
 */
export function istinyeTipsterCoupons(
  text:string
):Array<Map<number,number[]>> {
  const tipsters:
    Array<Map<number,number[]>> = [];

  let current:
    Map<number,number[]> | null =
    null;

  let inCoupon =
    false;

  for (
    const rawLine of
    text.split("\n")
  ) {
    const line =
      rawLine.trim();

    if (!line) {
      continue;
    }

    const heading =
      /^(\d)\s*\.\s*Altılı\s+Ganyan$/iu.exec(
        line
      );

    if (heading) {
      if (
        Number(heading[1]) === 1 ||
        !current
      ) {
        current = new Map();
        tipsters.push(current);
      }

      inCoupon = true;
      continue;
    }

    const leg =
      inCoupon
        ? /^(\d{1,2})\s*\.\s*Koşu\s*:\s*([\d\s,\-–.]+)$/iu.exec(
            line
          )
        : null;

    if (
      !leg ||
      !current
    ) {
      inCoupon = false;
      continue;
    }

    const horses =
      (
        leg[2].match(/\d{1,2}/g) ??
        []
      )
        .map(Number)
        .filter(
          number =>
            number > 0 &&
            number <= 30
        );

    if (horses.length) {
      current.set(
        Number(leg[1]),
        [...new Set(horses)]
      );
    }
  }

  return tipsters.filter(
    tipster =>
      tipster.size > 0
  );
}


export function istinyeConsensusRaces(
  city:string,
  tipsters:Array<Map<number,number[]>>
):RawExpertRace[] {
  const raceNumbers =
    [
      ...new Set(
        tipsters.flatMap(
          tipster =>
            [...tipster.keys()]
        )
      )
    ].sort(
      (a,b) => a-b
    );

  const races:
    RawExpertRace[] = [];

  for (const raceNumber of raceNumbers) {
    const legs =
      tipsters
        .map(
          tipster =>
            tipster.get(raceNumber)
        )
        .filter(
          (leg):leg is number[] =>
            Boolean(leg?.length)
        );

    const score =
      new Map<number,number>();

    const tek =
      new Map<number,number>();

    for (const leg of legs) {
      for (const horse of leg) {
        score.set(
          horse,
          (score.get(horse) ?? 0) +
            1 / leg.length
        );
      }

      if (leg.length === 1) {
        tek.set(
          leg[0],
          (tek.get(leg[0]) ?? 0) + 1
        );
      }
    }

    const ranked =
      [...score.entries()]
        .sort(
          (a,b) =>
            b[1] - a[1] ||
            a[0] - b[0]
        );

    if (!ranked.length) {
      continue;
    }

    const [topHorse, topScore] =
      ranked[0];

    /*
     * Horses tied at the top share it: no single favourite, each
     * is a strong pick.
     */
    const leaders =
      ranked.filter(
        ([,value]) =>
          Math.abs(value - topScore) < 1e-9
      );

    /*
     * A wide tie (e.g. one tipster writing the whole field) says
     * nothing about any single horse.
     */
    if (leaders.length > 3) {
      continue;
    }

    const topTek =
      tek.get(topHorse) ?? 0;

    const selections:
      RawExpertSelection[] =
      leaders.length > 1
        ? leaders.map(
            ([horse]) => ({
              horseNumber:horse,
              comment:null,
              labels:["strong"]
            })
          )
        : [
            {
              horseNumber:
                topHorse,

              comment:
                `Kupon konsensüsü (${legs.length} yorumcu)`,

              labels:
                legs.length >= 2 &&
                topTek * 2 >= legs.length
                  ? ["banko"]
                  : ["favorite"]
            }
          ];

    for (
      const [horse] of
      ranked
        .slice(leaders.length)
        .filter(
          ([,value]) =>
            value * 2 >= topScore
        )
        .slice(0, MAX_RIVALS)
    ) {
      selections.push({
        horseNumber:horse,
        comment:null,
        labels:["rival"]
      });
    }

    races.push({
      city,
      raceNumber,
      selections,
      numberGroups:[]
    });
  }

  return races;
}


export function parseIstinyeCoupons(
  html:string,
  raceDate:string,
  cities:string[]
):{
  extraction:RawExpertExtraction;
  matchedPosts:Array<{
    city:string;
    title:string;
    tipsters:number;
  }>;
} {
  const $ =
    cheerio.load(html);

  const posts:
    Array<{
      title:string;
      node:ReturnType<cheerio.CheerioAPI>;
    }> = [];

  $("article.elementor-post").each(
    (_index, element) => {
      const node =
        $(element);

      posts.push({
        title:
          node
            .find(".elementor-post__title")
            .first()
            .text()
            .replace(/\s+/g," ")
            .trim(),
        node
      });
    }
  );

  /*
   * A single-post page (archive mode) has no post grid.
   */
  if (!posts.length) {
    posts.push({
      title:
        $("h1").first().text()
          .replace(/\s+/g," ")
          .trim(),

      node:
        $("body")
    });
  }

  const races:
    RawExpertRace[] = [];

  const matchedPosts:
    Array<{
      city:string;
      title:string;
      tipsters:number;
    }> = [];

  for (const city of cities) {
    const post =
      posts.find(
        candidate =>
          istinyeTitleMatches(
            candidate.title,
            raceDate,
            city
          )
      );

    if (!post) {
      continue;
    }

    const tipsters =
      istinyeTipsterCoupons(
        postText($, post.node)
      );

    matchedPosts.push({
      city,
      title:post.title,
      tipsters:tipsters.length
    });

    races.push(
      ...istinyeConsensusRaces(
        city,
        tipsters
      )
    );
  }

  return {
    extraction:{ races },
    matchedPosts
  };
}
