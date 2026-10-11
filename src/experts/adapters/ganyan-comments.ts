import * as cheerio from "cheerio";

import type {
  RawExpertExtraction,
  RawExpertLabel,
  RawExpertRace
} from "../raw-extraction";

import {
  normalizeExpertSearchText
} from "../text-normalization";


/*
 * Ganyan Canavarı's galop article is behind a login; what is public
 * is the city's "En Son Yorumlar" block (see
 * extractGanyanCommentsSection), a handful of comments, each tied
 * to one horse by the site itself:
 *
 *   "son yarısinda ... alternatif banko adayı"
 *   Arananadam52 tarafından 4. koşuda (6)GÜLEYCANOĞLU için yazıldı
 *
 * A comment is a pick only when it names its role in words (banko,
 * favori, sürpriz, yıldız, güçlü). Praise without a role ("formu
 * iyi gelebilir") and horse numbers listed inside the text ("rakip
 * 3 4 6") are not picks. The site's horse name travels with each
 * row so the extractor can drop rows that disagree with TJK.
 */

const ROLE_WORDS:
  Array<[string, RawExpertLabel]> = [
    ["banko","banko"],
    ["favori","favorite"],
    ["surpriz","surprise"],
    ["supriz","surprise"],
    ["yildiz","star"],
    ["guclu","strong"]
  ];


const COMMENT_IDENTITY =
  /tarafından\s+(\d{1,2})\s*\.\s*koşuda\s*\(\s*(\d{1,2})\s*\)\s*(.+?)\s+için\s+yazıldı/gu;


export function ganyanCommentLabels(
  comment:string
):RawExpertLabel[] {
  const words =
    normalizeExpertSearchText(comment)
      .split(" ");

  return [
    ...new Set(
      ROLE_WORDS
        .filter(
          ([stem]) =>
            words.some(
              word =>
                word.startsWith(stem)
            )
        )
        .map(([, label]) => label)
    )
  ];
}


/*
 * The comment is the last quoted text before its identity line.
 */
function quotedComment(
  chunk:string
):string {
  const end =
    chunk.lastIndexOf("\"");

  const start =
    chunk.lastIndexOf("\"", end - 1);

  return start >= 0 && end > start
    ? chunk.slice(start + 1, end).trim()
    : "";
}


export function parseGanyanComments(
  html:string,
  city:string
):RawExpertExtraction {
  const text =
    cheerio.load(html)("body").text();

  const races =
    new Map<number,RawExpertRace>();

  let previousEnd =
    0;

  for (const identity of text.matchAll(COMMENT_IDENTITY)) {
    const start =
      identity.index ?? 0;

    const comment =
      quotedComment(
        text.slice(previousEnd, start)
      );

    previousEnd =
      start + identity[0].length;

    const labels =
      ganyanCommentLabels(comment);

    if (!labels.length) {
      continue;
    }

    const raceNumber =
      Number(identity[1]);

    const race =
      races.get(raceNumber) ?? {
        city,
        raceNumber,
        selections:[],
        numberGroups:[]
      };

    const horseNumber =
      Number(identity[2]);

    const existing =
      race.selections.find(
        selection =>
          selection.horseNumber === horseNumber
      );

    /*
     * Several readers may comment on the same horse.
     */
    if (existing) {
      existing.labels = [
        ...new Set([
          ...existing.labels,
          ...labels
        ])
      ];

      continue;
    }

    race.selections.push({
      horseNumber,

      horseName:
        identity[3].trim(),

      comment,

      labels
    });

    races.set(raceNumber, race);
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
