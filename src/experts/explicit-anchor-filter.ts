import type {
  RawExpertExtraction,
  RawExpertSelection
} from "./raw-extraction";

import type {
  ExplicitCouponExpectedSelection
} from "./coupon-completeness";

import {
  normalizeExpertSearchText
} from "./text-normalization";


function cityKey(
  value:
    string
): string {
  return normalizeExpertSearchText(
    value
  ).replace(
    /\s+/g,
    ""
  );
}


export function filterRawToExplicitAnchors(
  raw:
    RawExpertExtraction,

  expected:
    ExplicitCouponExpectedSelection[]
) {
  const races =
    new Map<
      string,
      {
        city:string;
        raceNumber:number;
        selections:RawExpertSelection[];
        numberGroups:[];
      }
    >();


  let kept=0;


  for (const anchor of expected) {
    const sourceRace =
      (
        raw.races ??
        []
      ).find(
        race =>
          cityKey(
            race.city
          ) ===
            cityKey(
              anchor.city
            ) &&
          Number(
            race.raceNumber
          ) ===
            anchor.raceNumber
      );


    if (!sourceRace) {
      continue;
    }


    const explicitSelection =
      (
        sourceRace.selections ??
        []
      ).find(
        selection =>
          Number(
            selection.horseNumber
          ) ===
            anchor.horseNumber
      );


    const explicitGroup =
      (
        sourceRace.numberGroups ??
        []
      ).some(
        group =>
          group.label ===
            "banko" &&
          (
            group.horseNumbers ??
            []
          )
            .map(Number)
            .includes(
              anchor.horseNumber
            )
      );


    if (
      !explicitSelection &&
      !explicitGroup
    ) {
      continue;
    }


    const raceKey =
      [
        cityKey(
          anchor.city
        ),
        anchor.raceNumber
      ].join("|");


    let bucket =
      races.get(
        raceKey
      );


    if (!bucket) {
      bucket = {
        city:
          anchor.city,

        raceNumber:
          anchor.raceNumber,

        selections:[],

        numberGroups:[]
      };

      races.set(
        raceKey,
        bucket
      );
    }


    const labels =
      new Set(
        explicitSelection
          ?.labels ??
        []
      );


    labels.add(
      "banko"
    );


    bucket.selections.push({
      horseNumber:
        anchor.horseNumber,

      horseName:
        explicitSelection
          ?.horseName ??
        null,

      comment:
        explicitSelection
          ?.comment ??
        null,

      labels:[
        ...labels
      ]
    });


    kept++;
  }


  const value:
    RawExpertExtraction = {
      races:[
        ...races.values()
      ]
    };


  return {
    value,

    diagnostics:{
      expected:
        expected.length,

      inputRaces:
        raw.races.length,

      outputRaces:
        value.races.length,

      keptSelections:
        kept
    }
  };
}
