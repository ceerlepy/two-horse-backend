import * as cheerio from "cheerio";

import type {
  RawExpertExtraction,
  RawExpertRace
} from "../raw-extraction";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  raceDateParts
} from "./article-url-utils";


/*
 * İstinye Ganyan's "tahminler" page carries one long post per city
 * ("06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ"). Sending the whole
 * page (two cities, ~50k characters) to Workers AI timed out (3046),
 * so the post is read directly.
 *
 * Coupon legs are NOT read: a coupon does not say which horse a
 * tipster prefers. The only explicit choice the post makes per race
 * is its named win bet, in one of two layouts seen live:
 *
 *   1. Koşu
 *   Sabit Ganyan: 4 numaralı KURT BAKIŞLI
 *
 *   Sabit Bahis (Kazanır / Ganyan Bahsi)
 *   Günün birincilik için en sağlam adayları:
 *   1. Koşu: 8 SEVDE RAIDERS (...)
 *
 * Each becomes the source's favourite for that race, carrying the
 * horse's name so the extractor can reject any row whose number and
 * name disagree with the TJK program. Anything else on the page is
 * ignored; a post in another layout simply yields no picks.
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
 * "8 SEVDE RAIDERS (Good Curry yavrusu ...) 🥇" -> "SEVDE RAIDERS".
 */
function horseName(
  value:string
):string {
  return value
    .split(/[(,]/u)[0]
    .replace(/[^\p{L}\p{N}' .]/gu,"")
    .replace(/\s+/g," ")
    .trim();
}


export function istinyeWinBets(
  text:string
):Map<number,{ horseNumber:number; horseName:string }> {
  const bets =
    new Map<number,{ horseNumber:number; horseName:string }>();

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
    const heading =
      /^(\d{1,2})\s*\.\s*Koşu$/iu.exec(line);

    if (heading) {
      raceHeading = Number(heading[1]);
      inList = false;
      continue;
    }

    const sabitGanyan =
      /^Sabit\s+Ganyan\s*:\s*(\d{1,2})\s*numaralı\s+(.+)$/iu.exec(
        line
      );

    if (
      sabitGanyan &&
      raceHeading !== null
    ) {
      bets.set(raceHeading, {
        horseNumber:Number(sabitGanyan[1]),
        horseName:horseName(sabitGanyan[2])
      });
    }

    raceHeading = null;

    if (/^Sabit\s+Bahis\b/iu.test(line)) {
      inList = true;
      continue;
    }

    if (!inList) {
      continue;
    }

    const item =
      /^(\d{1,2})\s*\.\s*Koşu\s*:\s*(\d{1,2})\s+(\p{L}.*)$/u.exec(
        line
      );

    if (item) {
      bets.set(Number(item[1]), {
        horseNumber:Number(item[2]),
        horseName:horseName(item[3])
      });

    /*
     * An intro line ("... en sağlam adayları:") may sit between
     * the header and the list; anything else ends the list.
     */
    } else if (!/:$/u.test(line)) {
      inList = false;
    }
  }

  return bets;
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
    winBets:number;
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
      winBets:number;
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

    const bets =
      istinyeWinBets(
        postText($, post.node)
      );

    matchedPosts.push({
      city,
      title:post.title,
      winBets:bets.size
    });

    for (
      const [raceNumber, bet] of
      [...bets.entries()].sort(
        (a,b) => a[0] - b[0]
      )
    ) {
      races.push({
        city,
        raceNumber,

        selections:[
          {
            horseNumber:
              bet.horseNumber,

            horseName:
              bet.horseName,

            comment:
              "Sabit ganyan",

            labels:["favorite"]
          }
        ],

        numberGroups:[]
      });
    }
  }

  return {
    extraction:{ races },
    matchedPosts
  };
}
