import type {
  RawExpertExtraction
} from "./raw-extraction";

import {
  normalizeExpertSearchText
} from "./text-normalization";


function sourceRaceNumbers(
  text:
    string
): number[] {
  const values =
    new Set<number>();


  const pattern =
    /\b(\d{1,2})\s*\.\s*(?:koşu|kosu)\b/giu;


  for (
    const match of
    text.matchAll(
      pattern
    )
  ) {
    const value =
      Number(
        match[1]
      );


    if (
      Number.isInteger(
        value
      ) &&
      value >
        0 &&
      value <=
        30
    ) {
      values.add(
        value
      );
    }
  }


  return [
    ...values
  ]
    .sort(
      (
        first,
        second
      ) =>
        first -
        second
    );
}


export function inspectAfaCompleteness(
  raw:
    RawExpertExtraction,

  sourceText:
    string,

  targetCities:
    string[]
) {
  const expected =
    sourceRaceNumbers(
      sourceText
    );


  const normalizedCities =
    targetCities.map(
      normalizeExpertSearchText
    );


  const actual =
    [
      ...new Set(
        raw.races
          .filter(
            race =>
              normalizedCities.includes(
                normalizeExpertSearchText(
                  race.city
                )
              )
          )
          .map(
            race =>
              Number(
                race.raceNumber
              )
          )
          .filter(
            raceNumber =>
              Number.isInteger(
                raceNumber
              ) &&
              raceNumber >
                0
          )
      )
    ]
      .sort(
        (
          first,
          second
        ) =>
          first -
          second
      );


  const missing =
    expected.filter(
      raceNumber =>
        !actual.includes(
          raceNumber
        )
    );


  return {
    complete:
      expected.length >
        0 &&
      missing.length ===
        0,

    expected,
    actual,
    missing
  };
}
