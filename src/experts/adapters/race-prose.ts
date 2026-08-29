import {
  load
} from "cheerio";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  normalizeExpertHorseName
} from "../validator";

import type {
  ExpertAcquireContext
} from "./types";


function escapeHtml(
  value:string
):string {
  return value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}


function decodedUrlMaterial(
  value:string
):string {
  try {
    const url =
      new URL(value);

    return decodeURIComponent(
      `${url.pathname} ${url.search}`
    );
  } catch {
    try {
      return decodeURIComponent(
        value
      );
    } catch {
      return value;
    }
  }
}


function sourceText(
  html:string
):string {
  const $ =
    load(html);

  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "iframe",
      "nav",
      "footer",
      "form"
    ].join(",")
  ).remove();

  const roots = [
    "article",
    "main",
    "[role='main']",
    "body"
  ];

  let selector =
    "body";

  for (
    const candidate of
    roots
  ) {
    const node =
      $(candidate)
        .first();

    const text =
      node
        .text()
        .trim();

    if (
      text.length >=
        300
    ) {
      selector =
        candidate;
      break;
    }
  }

  const root =
    $(selector)
      .first();

  root
    .find("br")
    .replaceWith("\n");

  root
    .find(
      [
        "p",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "li",
        "tr",
        "section"
      ].join(",")
    )
    .each(
      (
        _index,
        element
      ) => {
        $(element)
          .append("\n");
      }
    );

  return root
    .text()
    .replace(/\u00a0/g," ")
    .replace(/[ \t\r]+/g," ")
    .replace(/\n[ \t]+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}


function targetCity(
  context:
    ExpertAcquireContext,

  text:string
):{
  city:string;
  confirmedByUrl:boolean;
} {
  const urlMaterial =
    normalizeExpertSearchText(
      decodedUrlMaterial(
        context.url
      )
    );

  const fromUrl =
    context.cities
      .filter(
        city =>
          urlMaterial.includes(
            normalizeExpertSearchText(
              city
            )
          )
      );

  if (
    fromUrl.length ===
      1
  ) {
    return {
      city:fromUrl[0],
      confirmedByUrl:true
    };
  }

  const normalizedText =
    normalizeExpertSearchText(
      text
    );

  const fromBody =
    context.cities
      .filter(
        city =>
          normalizedText.includes(
            normalizeExpertSearchText(
              city
            )
          )
      );

  if (
    fromBody.length ===
      1
  ) {
    return {
      city:fromBody[0],
      confirmedByUrl:false
    };
  }

  if (
    context.cities.length ===
      1
  ) {
    return {
      city:context.cities[0],
      confirmedByUrl:false
    };
  }

  throw new Error(
    "RACE_PROSE_TARGET_CITY_AMBIGUOUS"
  );
}


/*
 * Some sources number their OWN "1.KOŞU"/"1A)" leg counter from
 * whichever race they start covering, not from the official TJK
 * race_number — e.g. Yarış Dergisi skips an uncovered opener and
 * calls the official race 2 "1.KOŞU". Trusting that literal number
 * verbatim silently mislabels every pick in the block, so every
 * pick in it fails canonical validation even though the AI read
 * the real horses correctly.
 *
 * Resolve the true official race number by matching the horse
 * names actually present in the block against D1's real runners
 * for that city/date. Requires at least two independent name hits
 * to override — a single coincidental substring match is not
 * enough evidence to relabel a whole block.
 */
async function officialRaceNameIndex(
  context:
    ExpertAcquireContext,

  city:
    string
):Promise<Map<number,string[]> | null> {
  try {
    const rows =
      await context.env.DB.prepare(`
        SELECT race_number, horse_name, city
        FROM runners
        WHERE race_date = ?
      `)
        .bind(
          context.raceDate
        )
        .all<any>();

    const normalizedTarget =
      normalizeExpertSearchText(
        city
      );

    const index =
      new Map<number,string[]>();

    for (
      const row of
      (rows.results ?? [])
    ) {
      if (
        normalizeExpertSearchText(
          String(row.city)
        ) !==
        normalizedTarget
      ) {
        continue;
      }

      const raceNumber =
        Number(
          row.race_number
        );

      const name =
        normalizeExpertHorseName(
          String(row.horse_name)
        );

      if (!name) continue;

      const list =
        index.get(raceNumber) ??
        [];

      list.push(name);
      index.set(raceNumber, list);
    }

    return index.size
      ? index
      : null;
  } catch {
    return null;
  }
}


function resolveOfficialRaceNumber(
  index:
    Map<number,string[]>,

  blockText:
    string,

  parsedRaceNumber:
    number
):number {
  const haystack =
    normalizeExpertHorseName(
      blockText
    );

  let bestRace =
    parsedRaceNumber;

  let bestHits =
    (index.get(parsedRaceNumber) ?? [])
      .filter(
        name =>
          name.length >= 4 &&
          haystack.includes(name)
      ).length;

  for (
    const [raceNumber, names] of
    index
  ) {
    if (raceNumber === parsedRaceNumber) continue;

    const hits =
      names.filter(
        name =>
          name.length >= 4 &&
          haystack.includes(name)
      ).length;

    if (hits > bestHits) {
      bestHits = hits;
      bestRace = raceNumber;
    }
  }

  return bestHits >= 2
    ? bestRace
    : parsedRaceNumber;
}


export async function prepareRaceProseArticle(
  context:
    ExpertAcquireContext,

  acquired:
    AcquiredHtml,

  sourceName:
    string
):Promise<AcquiredHtml> {
  const text =
    sourceText(
      acquired.html
    );

  const {
    city,
    confirmedByUrl
  } =
    targetCity(
      context,
      text
    );

  /*
   * Critical acquisition gate — but only when the URL itself
   * did not already name the city unambiguously.
   *
   * When the city came from the URL (e.g.
   * ".../herkulbey-bankom-ankara29826-..."), that is already
   * a specific, per-article identity — re-demanding the city
   * word verbatim in prose wrongly rejects real articles whose
   * theme keeps the city in a byline/H1 outside the extracted
   * <article> root rather than repeating it in body text.
   *
   * When the city instead came from body text or a single-city
   * fallback, the URL was generic (e.g. istinye's
   * "current tahminler" page), so the body IS the only evidence
   * of identity — this is what prevents Istinye Kocaeli from
   * accepting an unrelated/generic fallback page, and stays
   * enforced.
   */
  if (
    !confirmedByUrl &&
    !normalizeExpertSearchText(
      text
    ).includes(
      normalizeExpertSearchText(
        city
      )
    )
  ) {
    throw new Error(
      `RACE_PROSE_TARGET_CITY_NOT_IN_BODY:${city}`
    );
  }

  /*
   * "N. KOŞU" is not universal. Yarış Dergisi's real
   * articles (confirmed via an indexed excerpt — the site's
   * own anti-bot wall blocks fetching the raw HTML directly,
   * including its WordPress REST API, so this could not be
   * verified against a full article body) write each leg as
   * "1A) ...", "2A) ..." instead of spelling out "KOŞU"/"AYAK".
   * Accept all three forms; this only ADDS acceptance, so a
   * source already matching "N. KOŞU" is unaffected.
   */
  const regex =
    /(\d{1,2})\s*\.\s*KOŞU\b\s*:?\s*|(\d{1,2})\s*\.?\s*AYAK\b\s*:?\s*|\b(\d{1,2})\s*A\)\s*/giu;

  const matches:
    Array<{
      raceNumber:number;
      start:number;
      bodyStart:number;
    }> = [];

  let match:
    RegExpExecArray |
    null;

  while (
    (
      match =
        regex.exec(text)
    ) !== null
  ) {
    const raceNumber =
      Number(
        match[1] ??
        match[2] ??
        match[3]
      );

    if (
      !Number.isInteger(
        raceNumber
      ) ||
      raceNumber <= 0 ||
      raceNumber > 30
    ) {
      continue;
    }

    matches.push({
      raceNumber,

      start:
        match.index,

      bodyStart:
        regex.lastIndex
    });
  }

  if (
    !matches.length
  ) {
    throw new Error(
      "RACE_PROSE_NO_RACE_BLOCKS"
    );
  }

  const blocks:
    Array<{
      raceNumber:number;
      text:string;
    }> = [];

  for (
    let index=0;
    index<matches.length;
    index++
  ) {
    const current =
      matches[index];

    const next =
      matches[
        index+1
      ];

    const body =
      text
        .slice(
          current.bodyStart,
          next
            ? next.start
            : text.length
        )
        .trim();

    if (
      body.length <
        20
    ) {
      continue;
    }

    blocks.push({
      raceNumber:
        current.raceNumber,

      text:
        body
    });
  }

  if (
    !blocks.length
  ) {
    throw new Error(
      "RACE_PROSE_NO_USEFUL_BLOCKS"
    );
  }

  const officialIndex =
    await officialRaceNameIndex(
      context,
      city
    );

  const resolvedBlocks =
    officialIndex
      ? blocks.map(
          block => ({
            ...block,

            raceNumber:
              resolveOfficialRaceNumber(
                officialIndex,
                block.text,
                block.raceNumber
              )
          })
        )
      : blocks;

  const payload =
    [
      `TWOHORSE SOURCE: ${sourceName}`,
      `TWOHORSE TARGET DATE: ${context.raceDate}`,
      `TWOHORSE TARGET CITY: ${city}`,
      "",
      ...resolvedBlocks.flatMap(
        block => [
          `TWOHORSE_RACE_CONTEXT|CITY=${city}|RACE=${block.raceNumber}`,
          `${block.raceNumber}.KOŞU: ${block.text}`,
          "TWOHORSE_RACE_CONTEXT_END",
          ""
        ]
      )
    ].join("\n");

  const html =
    [
      "<html>",
      "<body>",
      "<article>",
      "<pre>",
      escapeHtml(
        payload
      ),
      "</pre>",
      "</article>",
      "</body>",
      "</html>"
    ].join("");

  return {
    ...acquired,

    html,

    bodyLength:
      html.length,

    contentType:
      "text/html",

    diagnostics:{
      ...(
        (
          acquired as
            AcquiredHtml & {
              diagnostics?:
                Record<
                  string,
                  unknown
                >;
            }
        )
          .diagnostics ??
        {}
      ),

      raceProse:{
        traceVersion:
          "race-prose-v1",

        city,

        raceBlockCount:
          resolvedBlocks.length,

        races:
          [
            ...new Set(
              resolvedBlocks.map(
                block =>
                  block.raceNumber
              )
            )
          ],

        raceNumberResolvedFromD1:
          officialIndex !== null
      }
    }
  };
}
