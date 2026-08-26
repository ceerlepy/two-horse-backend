import type {
  RawExpertExtraction
} from "./raw-extraction";

import {
  normalizeExpertSearchText
} from "./text-normalization";


function markerRaceNumbers(
  text:string,
  targetCities:string[]
): number[] {
  const wanted =
    new Set(
      targetCities.map(
        normalizeExpertSearchText
      )
    );

  const values =
    new Set<number>();

  const pattern =
    /AFA_RACE_CONTEXT\|CITY=([^|\n]+)\|RACE=(\d{1,2})/giu;

  for (
    const match of
    text.matchAll(pattern)
  ) {
    const city =
      normalizeExpertSearchText(
        match[1]
      );

    const raceNumber =
      Number(match[2]);

    if (
      wanted.has(city) &&
      Number.isInteger(raceNumber) &&
      raceNumber > 0
    ) {
      values.add(raceNumber);
    }
  }

  return [...values]
    .sort((a,b) => a-b);
}


function headingRaceNumbers(
  text:string
): number[] {
  const values =
    new Set<number>();

  for (
    const match of
    text.matchAll(
      /\b(\d{1,2})\s*\.\s*(?:koşu|kosu)\b/giu
    )
  ) {
    const value =
      Number(match[1]);

    if (
      Number.isInteger(value) &&
      value > 0 &&
      value <= 30
    ) {
      values.add(value);
    }
  }

  return [...values]
    .sort((a,b) => a-b);
}


function hasHorseEvidence(
  race:
    RawExpertExtraction["races"][number]
) {
  return (
    (race.selections ?? []).length >
      0 ||
    (race.numberGroups ?? [])
      .some(
        group =>
          (group.horseNumbers ?? [])
            .length >
          0
      )
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
  const markerExpected =
    markerRaceNumbers(
      sourceText,
      targetCities
    );

  const expected =
    markerExpected.length
      ? markerExpected
      : headingRaceNumbers(
          sourceText
        );

  const normalizedCities =
    new Set(
      targetCities.map(
        normalizeExpertSearchText
      )
    );

  const actual =
    [
      ...new Set<number>(
        raw.races
          .filter(
            race =>
              normalizedCities.has(
                normalizeExpertSearchText(
                  race.city
                )
              ) &&
              hasHorseEvidence(race)
          )
          .map(
            race =>
              Number(
                race.raceNumber
              )
          )
          .filter(
            value =>
              Number.isInteger(value) &&
              value > 0
          )
      )
    ]
      .sort((a,b) => a-b);

  const missing =
    expected.filter(
      raceNumber =>
        !actual.includes(
          raceNumber
        )
    );

  return {
    complete:
      expected.length > 0 &&
      missing.length === 0,

    expected,
    actual,
    missing
  };
}
