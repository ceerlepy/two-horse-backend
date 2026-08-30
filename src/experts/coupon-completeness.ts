import type {
  RawExpertExtraction
} from "./raw-extraction";

import type {
  SixfoldStartInfo
} from "./prompt";

import {
  normalizeExpertSearchText
} from "./text-normalization";


export interface ExplicitCouponExpectedSelection {
  city:string;
  raceNumber:number;
  horseNumber:number;
  label:"banko";
}


function normalizedCity(
  value:string
): string {
  return normalizeExpertSearchText(
    value
  ).replace(/\s+/g,"");
}


function primaryArticleCity(
  text:string,
  cities:string[]
): string | null {
  /*
   * Related-post sections may mention other cities.
   * Source identity is determined from the article head.
   */
  const head =
    normalizeExpertSearchText(
      text.slice(0,1000)
    );

  let best:
    {
      city:string;
      index:number;
    } | null =
    null;


  for (const city of cities) {
    const index =
      head.indexOf(
        normalizeExpertSearchText(
          city
        )
      );

    if (
      index >= 0 &&
      (
        !best ||
        index < best.index
      )
    ) {
      best = {
        city,
        index
      };
    }
  }


  return best?.city ?? null;
}


export function explicitCouponExpectedSelections(
  text:string,
  cities:string[],
  sixfoldStarts:SixfoldStartInfo[]
): ExplicitCouponExpectedSelection[] {
  const city =
    primaryArticleCity(
      text,
      cities
    );


  if (!city) {
    return [];
  }


  const headings =
    [
      ...text.matchAll(
        /(\d+)\s*\.\s*Altılı(?:\s+Ganyan)?(?:\s+Tahmin)?/giu
      )
    ];


  const output =
    new Map<
      string,
      ExplicitCouponExpectedSelection
    >();


  for (
    let i=0;
    i<headings.length;
    i++
  ) {
    const heading =
      headings[i];

    const sixfoldNumber =
      Number(
        heading[1]
      );


    const start =
      sixfoldStarts.find(
        value =>
          normalizedCity(
            value.city
          ) ===
            normalizedCity(
              city
            ) &&
          value.sixfoldNumber ===
            sixfoldNumber
      );


    if (!start) {
      continue;
    }


    const from =
      (
        heading.index ??
        0
      ) +
      heading[0].length;


    const to =
      i + 1 < headings.length
        ? (
            headings[i+1]
              .index ??
            text.length
          )
        : text.length;


    const section =
      text.slice(
        from,
        to
      );


    for (
      const match of
      section.matchAll(
        /(\d+)\s*\.\s*AYAK\s*:\s*(\d+)\s+[^\n\r]{0,120}?\s+(BANKO|TEK)(?=\s|$)/giu
      )
    ) {
      const legNumber =
        Number(match[1]);

      const horseNumber =
        Number(match[2]);


      if (
        !Number.isInteger(
          legNumber
        ) ||
        legNumber <= 0 ||
        !Number.isInteger(
          horseNumber
        ) ||
        horseNumber <= 0
      ) {
        continue;
      }


      const raceNumber =
        start.raceNumber +
        legNumber -
        1;


      const value:
        ExplicitCouponExpectedSelection = {
          city,
          raceNumber,
          horseNumber,
          label:"banko"
        };


      output.set(
        [
          normalizedCity(city),
          raceNumber,
          horseNumber,
          "banko"
        ].join("|"),
        value
      );
    }
  }


  return [
    ...output.values()
  ];
}


export function explicitCouponExpectationPrompt(
  values:
    ExplicitCouponExpectedSelection[]
): string {
  if (!values.length) {
    return "";
  }


  return `
DETERMINISTIC EXPLICIT SOURCE ANCHORS

Kaynak metinde açık BANKO/TEK olarak yazılmış ve canonical
TJK Altılı başlangıç haritasıyla resmi koşuya bağlanmış
seçimler:

${values
  .map(
    value =>
      `${value.city} R${value.raceNumber} #${value.horseNumber} -> banko`
  )
  .join("\n")}

Bunlar model tahmini değildir.
Kaynağın açık expert evidence'ıdır.
Bu seçimleri races[].selections[] içinde eksiksiz koru.
`.trim();
}


export function inspectExplicitCouponCompleteness(
  raw:RawExpertExtraction,
  expected:ExplicitCouponExpectedSelection[]
) {
  const missing:
    ExplicitCouponExpectedSelection[] =
    [];


  for (const item of expected) {
    const race =
      (
        raw.races ??
        []
      ).find(
        value =>
          normalizedCity(
            value.city
          ) ===
            normalizedCity(
              item.city
            ) &&
          Number(
            value.raceNumber
          ) ===
            item.raceNumber
      );


    if (!race) {
      missing.push(item);
      continue;
    }


    const selectionFound =
      (
        race.selections ??
        []
      ).some(
        value =>
          Number(
            value.horseNumber
          ) ===
            item.horseNumber &&
          (
            value.labels ??
            []
          ).includes(
            "banko"
          )
      );


    const numberGroupFound =
      (
        race.numberGroups ??
        []
      ).some(
        value =>
          value.label ===
            "banko" &&
          (
            value.horseNumbers ??
            []
          )
            .map(Number)
            .includes(
              item.horseNumber
            )
      );


    if (
      !selectionFound &&
      !numberGroupFound
    ) {
      missing.push(item);
    }
  }


  return {
    complete:
      expected.length === 0 ||
      missing.length === 0,

    expected,
    missing
  };
}


/*
 * The prompt already hands the model these anchors as
 * deterministic fact, but a model can still drop one under
 * sampling (confirmed live: horseturk's Adana R3 banko). These
 * anchors were parsed straight out of the source's own text by
 * regex, not inferred — there is no reason to keep depending on
 * the model to faithfully echo a fact we already know with
 * certainty. Inject whatever the model's own output is missing
 * (city + race + horseNumber only; no name is required for a
 * canonical match) so a coupon-explicit source can never fail
 * completeness over the model's own recall.
 */
export function backfillExplicitCouponAnchors(
  raw:RawExpertExtraction,
  expected:ExplicitCouponExpectedSelection[]
):RawExpertExtraction {
  if (!expected.length) {
    return raw;
  }


  const races =
    (raw.races ?? [])
      .map(
        race => ({
          ...race,

          selections:[
            ...(race.selections ?? [])
          ],

          numberGroups:[
            ...(race.numberGroups ?? [])
          ]
        })
      );


  for (const item of expected) {
    let race =
      races.find(
        value =>
          normalizedCity(
            value.city
          ) ===
            normalizedCity(
              item.city
            ) &&
          Number(
            value.raceNumber
          ) ===
            item.raceNumber
      );


    if (!race) {
      race = {
        city:
          item.city,

        raceNumber:
          item.raceNumber,

        selections:[],
        numberGroups:[]
      };

      races.push(race);
    }


    const alreadyCovered =
      race.selections.some(
        value =>
          Number(
            value.horseNumber
          ) ===
            item.horseNumber &&
          (value.labels ?? [])
            .includes("banko")
      ) ||
      race.numberGroups.some(
        value =>
          value.label ===
            "banko" &&
          (value.horseNumbers ?? [])
            .map(Number)
            .includes(
              item.horseNumber
            )
      );


    if (alreadyCovered) {
      continue;
    }


    race.selections.push({
      horseNumber:
        item.horseNumber,

      horseName:
        null,

      comment:
        null,

      labels:["banko"]
    });
  }


  return {
    ...raw,
    races
  };
}
