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
 * AI timed out (3046), so the post is read directly instead.
 *
 * A horse that only sits in a multi-horse coupon leg is NOT a pick
 * (project rule: a coupon does not say which horse the tipster
 * prefers). Explicit choices only:
 *   - a horse a tipster wrote ALONE in a leg (a "tek"). Coupon lines
 *     use official race numbers; each tipster counts once per race.
 *     A horse at least half the tipsters covering the race wrote
 *     alone is the source's banko.
 *   - otherwise the post's named win bet ("Sabit Ganyan: 4 numaralı
 *     ..." or a "Sabit Bahis" list "1. Koşu: 8 SEVDE RAIDERS") is
 *     its favourite;
 *   - otherwise the horse with the most tek votes (no tie).
 * One pick per race.
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


/*
 * Named win bets, race -> horse number. Two layouts seen live:
 *   "1. Koşu" / "Sabit Ganyan: 4 numaralı KURT BAKIŞLI"
 *   "Sabit Bahis (Kazanır / Ganyan Bahsi)" / "1. Koşu: 8 SEVDE RAIDERS"
 */
export function istinyeWinBets(
  text:string
):Map<number,number> {
  const bets =
    new Map<number,number>();

  const lines =
    text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

  let raceHeading:
    number | null =
    null;

  let inList =
    false;

  for (const line of lines) {
    const sabitGanyan =
      /^Sabit\s+Ganyan\s*:\s*(\d{1,2})\s*numaralı/iu.exec(
        line
      );

    if (
      sabitGanyan &&
      raceHeading !== null
    ) {
      bets.set(
        raceHeading,
        Number(sabitGanyan[1])
      );
    }

    if (/^Sabit\s+Bahis\b/iu.test(line)) {
      inList = true;
      raceHeading = null;
      continue;
    }

    const heading =
      /^(\d{1,2})\s*\.\s*Koşu$/iu.exec(line);

    if (heading) {
      raceHeading = Number(heading[1]);
      inList = false;
      continue;
    }

    if (inList) {
      const item =
        /^(\d{1,2})\s*\.\s*Koşu\s*:\s*(\d{1,2})\s+\p{L}/u.exec(
          line
        );

      if (item) {
        bets.set(
          Number(item[1]),
          Number(item[2])
        );
        continue;
      }

      /*
       * An intro line ("Günün birincilik için en sağlam
       * adayları:") sits between the header and the list.
       */
      if (/:$/u.test(line)) {
        continue;
      }

      inList = false;
    }

    if (!sabitGanyan) {
      raceHeading = null;
    }
  }

  return bets;
}


export function istinyeExplicitRaces(
  city:string,
  tipsters:Array<Map<number,number[]>>,
  winBets:Map<number,number> = new Map()
):RawExpertRace[] {
  const raceNumbers =
    [
      ...new Set([
        ...tipsters.flatMap(
          tipster =>
            [...tipster.keys()]
        ),
        ...winBets.keys()
      ])
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

    const tek =
      new Map<number,number>();

    for (const leg of legs) {
      if (leg.length === 1) {
        tek.set(
          leg[0],
          (tek.get(leg[0]) ?? 0) + 1
        );
      }
    }

    const ranked =
      [...tek.entries()]
        .sort(
          (a,b) => b[1] - a[1]
        );

    const tekLeader =
      ranked.length &&
      (
        ranked.length === 1 ||
        ranked[1][1] < ranked[0][1]
      )
        ? ranked[0]
        : null;

    /*
     * A tek written by at least half the tipsters is the source's
     * banko. Otherwise the post's own named win bet speaks for the
     * whole source; a lone tipster's tek is the last resort.
     */
    const bankoLeader =
      tekLeader &&
      legs.length >= 2 &&
      tekLeader[1] * 2 >= legs.length
        ? tekLeader
        : null;

    let selection:
      RawExpertSelection | null =
      null;

    if (bankoLeader) {
      selection = {
        horseNumber:
          bankoLeader[0],

        comment:
          `${bankoLeader[1]}/${legs.length} yorumcu tek yazdı`,

        labels:["banko"]
      };

    } else if (winBets.has(raceNumber)) {
      selection = {
        horseNumber:
          winBets.get(raceNumber)!,

        comment:
          "Sabit ganyan",

        labels:["favorite"]
      };

    } else if (tekLeader) {
      selection = {
        horseNumber:
          tekLeader[0],

        comment:
          `${tekLeader[1]}/${legs.length} yorumcu tek yazdı`,

        labels:["favorite"]
      };
    }

    if (!selection) {
      continue;
    }

    races.push({
      city,
      raceNumber,
      selections:[selection],
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

    const text =
      postText($, post.node);

    const tipsters =
      istinyeTipsterCoupons(text);

    matchedPosts.push({
      city,
      title:post.title,
      tipsters:tipsters.length
    });

    races.push(
      ...istinyeExplicitRaces(
        city,
        tipsters,
        istinyeWinBets(text)
      )
    );
  }

  return {
    extraction:{ races },
    matchedPosts
  };
}
