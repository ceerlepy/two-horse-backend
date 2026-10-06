import * as cheerio from "cheerio";

import type {
  RawExpertExtraction,
  RawExpertRace
} from "../raw-extraction";

import type {
  SixfoldStartInfo
} from "../prompt";

import {
  normalizeExpertSearchText
} from "../text-normalization";


/*
 * HorseTurk publishes each city's tip as a plain Altılı coupon:
 *
 *   HorseTurk 1. Altılı Ganyan Tahmin
 *   1.AYAK: 4-3-2-7//1
 *   5.AYAK: 9 BEST OF ANADOLU
 *   HorseTurk 2. Altılı Ganyan Tahmin
 *   ...
 *
 * The leg lists ARE the expert's picks, so they are read directly
 * (no Workers AI). Legs map to official races through the canonical
 * Altılı start race, exactly like the other coupon sources:
 *   - a single horse in a leg (a "tek", usually written with its
 *     name and often "banko") -> banko
 *   - horses before "//" -> strong
 *   - horses after "//" (the source's backup picks) -> rival
 */
export function articleTextLines(
  html:string
):string {
  const $ =
    cheerio.load(html);

  $("script,style,noscript,ins,iframe").remove();

  const root =
    $(".entry-content").first().length
      ? $(".entry-content").first()
      : $("article").first().length
        ? $("article").first()
        : $("body");

  root.find("br").replaceWith("\n");
  root.find("p,h1,h2,h3,h4,h5,li,div").each(
    (_index, element) => {
      $(element).append("\n");
    }
  );

  return root
    .text()
    .replace(/ /g," ")
    .replace(/[ \t\r]+/g," ")
    .replace(/\n /g,"\n");
}


function horseNumbers(
  value:string
):number[] {
  return (
    value.match(/\d{1,2}/g) ??
    []
  )
    .map(Number)
    .filter(
      number =>
        number > 0 &&
        number <= 30
    );
}


export function parseHorseturkCoupon(
  html:string,
  city:string,
  sixfoldStarts:SixfoldStartInfo[]
):RawExpertExtraction {
  const text =
    articleTextLines(html);

  const cityKey =
    normalizeExpertSearchText(city);

  const headings =
    [
      ...text.matchAll(
        /(?:(\d)\s*\.\s*)?Altılı\s+Ganyan\s+Tahmin/giu
      )
    ];

  const races =
    new Map<number,RawExpertRace>();

  for (
    let index=0;
    index<headings.length;
    index++
  ) {
    const heading =
      headings[index];

    const sixfoldNumber =
      heading[1]
        ? Number(heading[1])
        : 1;

    const start =
      sixfoldStarts.find(
        value =>
          normalizeExpertSearchText(
            value.city
          ) === cityKey &&
          value.sixfoldNumber ===
            sixfoldNumber
      );

    if (!start) {
      continue;
    }

    const section =
      text.slice(
        (heading.index ?? 0) +
          heading[0].length,
        index + 1 < headings.length
          ? headings[index+1].index
          : text.length
      );

    for (
      const leg of
      section.matchAll(
        /(\d)\s*\.\s*AYAK\s*:\s*([^\n]+)/giu
      )
    ) {
      const legNumber =
        Number(leg[1]);

      if (
        legNumber < 1 ||
        legNumber > 6
      ) {
        continue;
      }

      const [mainPart, backupPart = ""] =
        leg[2].split("//");

      const main =
        horseNumbers(mainPart);

      const backup =
        horseNumbers(backupPart)
          .filter(
            number =>
              !main.includes(number)
          );

      if (!main.length) {
        continue;
      }

      const raceNumber =
        start.raceNumber +
        legNumber -
        1;

      const race =
        races.get(raceNumber) ?? {
          city,
          raceNumber,
          selections:[],
          numberGroups:[]
        };

      if (main.length === 1) {
        const name =
          mainPart
            .replace(/^\s*\d{1,2}\s*/,"")
            .replace(/\b(?:banko|tek)\b.*$/iu,"")
            .trim();

        race.selections.push({
          horseNumber:
            main[0],

          horseName:
            name || null,

          comment:
            "Kupon tek",

          labels:["banko"]
        });

      } else {
        race.numberGroups.push({
          label:"strong",
          horseNumbers:main
        });
      }

      if (backup.length) {
        race.numberGroups.push({
          label:"rival",
          horseNumbers:backup
        });
      }

      races.set(raceNumber,race);
    }
  }

  return {
    races:
      [...races.values()]
        .sort(
          (a,b) =>
            a.raceNumber -
            b.raceNumber
        )
  };
}
