import type {
  RawExpertExtraction
} from "./raw-extraction";


export interface LiderformExpectedMain {
  city:
    string;

  raceNumber:
    number;

  horseNumber:
    number;
}


export interface LiderformCompleteness {
  complete:
    boolean;

  expected:
    LiderformExpectedMain[];

  missing:
    Array<
      LiderformExpectedMain & {
        reason:
          "race-missing" |
          "main-selection-missing";
      }
    >;

  rawRaces:
    Array<{
      city:string;
      raceNumber:number;
      selections:number[];
      numberGroups:Array<{
        label:string;
        horseNumbers:number[];
      }>;
    }>;
}


export function isLiderformSourceName(
  sourceName:
    string
): boolean {
  return String(
    sourceName ?? ""
  )
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("tr-TR") ===
    "liderform";
}


function escapeRegExp(
  value:
    string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


function normalizeCity(
  value:
    string
): string {
  return String(value)
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[İIıi]/g,"I")
    .replace(/Ğ/g,"G")
    .replace(/Ü/g,"U")
    .replace(/Ş/g,"S")
    .replace(/Ö/g,"O")
    .replace(/Ç/g,"C")
    .replace(/[^A-Z0-9]/g,"");
}


/*
 * Liderform "Koşuların analizi" article contract:
 *
 * ... Bursa'da ... 9.Koşu olan ...;
 * (1) SİLUET ...
 *
 * We read ONLY:
 *
 * city
 * race number
 * explicit main horse number
 *
 * We deliberately do NOT infer:
 *
 * labels
 * comments
 * rivals
 * confidence
 *
 * AI remains the semantic extractor.
 */
export function liderformExpectedMainSelections(
  articleText:
    string,

  cities:
    string[]
): LiderformExpectedMain[] {
  const output =
    new Map<
      string,
      LiderformExpectedMain
    >();


  const occurrences:
    Array<{
      city:string;
      index:number;
    }> = [];


  for (
    const city of
    cities
  ) {
    if (!city.trim()) {
      continue;
    }

    const pattern =
      new RegExp(
        escapeRegExp(city),
        "giu"
      );

    for (
      const match of
      articleText.matchAll(pattern)
    ) {
      if (
        match.index !==
        undefined
      ) {
        occurrences.push({
          city,
          index:
            match.index
        });
      }
    }
  }


  occurrences.sort(
    (a,b) =>
      a.index-b.index
  );


  for (
    const occurrence of
    occurrences
  ) {
    const city =
      occurrence.city;

    const nextOther =
      occurrences.find(
        candidate =>
          candidate.index >
            occurrence.index &&
          normalizeCity(
            candidate.city
          ) !==
            normalizeCity(city)
      );

    const section =
      articleText.slice(
        occurrence.index,
        nextOther
          ? nextOther.index
          : articleText.length
      );

    const racePattern =
      /(\d+)\s*\.\s*Koşu\s+olan[^;]{0,350};\s*\((\d+)\)/giu;


    for (
      const match of
      section.matchAll(
        racePattern
      )
    ) {
      const raceNumber =
        Number(match[1]);

      const horseNumber =
        Number(match[2]);


      if (
        !Number.isInteger(
          raceNumber
        ) ||
        raceNumber <= 0 ||
        !Number.isInteger(
          horseNumber
        ) ||
        horseNumber <= 0
      ) {
        continue;
      }


      const item = {
        city,
        raceNumber,
        horseNumber
      };


      output.set(
        [
          normalizeCity(city),
          raceNumber
        ].join("|"),
        item
      );
    }
  }


  return [
    ...output.values()
  ];
}


export function inspectLiderformCompleteness(
  raw:
    RawExpertExtraction,

  articleText:
    string,

  cities:
    string[]
): LiderformCompleteness {
  const expected =
    liderformExpectedMainSelections(
      articleText,
      cities
    );


  const rawRaces =
    (raw.races ?? [])
      .map(
        race => ({
          city:
            String(race.city),

          raceNumber:
            Number(race.raceNumber),

          selections:
            (race.selections ?? [])
              .map(
                item =>
                  Number(
                    item.horseNumber
                  )
              ),

          numberGroups:
            (race.numberGroups ?? [])
              .map(
                group => ({
                  label:
                    String(
                      group.label
                    ),

                  horseNumbers:
                    (
                      group.horseNumbers ??
                      []
                    )
                      .map(Number)
                })
              )
        })
      );


  const missing:
    LiderformCompleteness[
      "missing"
    ] = [];


  for (
    const item of
    expected
  ) {
    const race =
      raw.races.find(
        candidate =>
          normalizeCity(
            candidate.city
          ) ===
            normalizeCity(
              item.city
            ) &&
          Number(
            candidate.raceNumber
          ) ===
            item.raceNumber
      );


    if (!race) {
      missing.push({
        ...item,
        reason:
          "race-missing"
      });

      continue;
    }


    const mainExists =
      (
        race.selections ??
        []
      )
        .some(
          selection =>
            Number(
              selection.horseNumber
            ) ===
              item.horseNumber
        );


    if (!mainExists) {
      missing.push({
        ...item,
        reason:
          "main-selection-missing"
      });
    }
  }


  /*
   * If the verified article pattern is visible, require
   * every article main anchor to exist in AI selections.
   *
   * If Liderform changes HTML/editorial format and no
   * anchors can be detected, still reject any race object
   * whose selections array is empty.
   */
  const emptySelectionRace =
    rawRaces.some(
      race =>
        race.selections.length ===
        0
    );


  return {
    complete:
      expected.length > 0
        ? missing.length === 0
        : !emptySelectionRace,

    expected,
    missing,
    rawRaces
  };
}
