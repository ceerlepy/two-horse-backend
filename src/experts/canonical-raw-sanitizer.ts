import type {
  RawExpertExtraction,
  RawExpertLabel,
  RawExpertSelection
} from "./raw-extraction";

import {
  normalizeExpertHorseName
} from "./validator";


export interface CanonicalRunnerIdentity {
  city:
    string;

  raceNumber:
    number;

  horseNumber:
    number;

  horseName:
    string;
}


function normalizedCity(
  value:
    string
): string {
  return String(
    value ??
    ""
  )
    .normalize(
      "NFKC"
    )
    .trim()
    .toLocaleUpperCase(
      "tr-TR"
    )
    .replace(/[İIıi]/g,"I")
    .replace(/Ğ/g,"G")
    .replace(/Ü/g,"U")
    .replace(/Ş/g,"S")
    .replace(/Ö/g,"O")
    .replace(/Ç/g,"C")
    .replace(/[^A-Z0-9]/g,"");
}


function canonicalKey(
  city:
    string,

  raceNumber:
    number,

  horseNumber:
    number
): string {
  return [
    normalizedCity(
      city
    ),
    raceNumber,
    horseNumber
  ].join("|");
}


function labelsUnion(
  first:
    RawExpertLabel[],

  second:
    RawExpertLabel[]
): RawExpertLabel[] {
  return [
    ...new Set<RawExpertLabel>([
      ...first,
      ...second
    ])
  ];
}


export function sanitizeRawAgainstCanonical(
  raw:
    RawExpertExtraction,

  canonical:
    CanonicalRunnerIdentity[]
) {
  const exact =
    new Map<
      string,
      CanonicalRunnerIdentity
    >();


  for (const runner of canonical) {
    exact.set(
      canonicalKey(
        runner.city,
        runner.raceNumber,
        runner.horseNumber
      ),
      runner
    );
  }


  type Bucket = {
    city:string;
    raceNumber:number;
    selections:
      Map<number,RawExpertSelection>;
  };


  const buckets =
    new Map<
      string,
      Bucket
    >();


  const repairs:
    any[] = [];

  const dropped:
    any[] = [];


  const bucketFor =
    (
      runner:
        CanonicalRunnerIdentity
    ) => {
      const key =
        [
          normalizedCity(
            runner.city
          ),
          runner.raceNumber
        ].join("|");


      let bucket =
        buckets.get(
          key
        );


      if (!bucket) {
        bucket = {
          city:
            runner.city,

          raceNumber:
            runner.raceNumber,

          selections:
            new Map()
        };


        buckets.set(
          key,
          bucket
        );
      }


      return bucket;
    };


  const addSelection =
    (
      runner:
        CanonicalRunnerIdentity,

      incoming:
        RawExpertSelection
    ) => {
      const bucket =
        bucketFor(
          runner
        );


      const previous =
        bucket.selections.get(
          runner.horseNumber
        );


      const normalized:
        RawExpertSelection = {
          horseNumber:
            runner.horseNumber,

          horseName:
            runner.horseName,

          comment:
            incoming.comment ??
            null,

          labels:[
            ...incoming.labels
          ]
        };


      if (!previous) {
        bucket.selections.set(
          runner.horseNumber,
          normalized
        );

        return;
      }


      const previousComment =
        String(
          previous.comment ??
          ""
        );

      const incomingComment =
        String(
          incoming.comment ??
          ""
        );


      bucket.selections.set(
        runner.horseNumber,
        {
          ...previous,

          horseName:
            runner.horseName,

          comment:
            incomingComment.length >
            previousComment.length
              ? incoming.comment
              : previous.comment,

          labels:
            labelsUnion(
              previous.labels,
              incoming.labels
            )
        }
      );
    };


  for (
    const rawRace of
    raw.races ??
    []
  ) {
    for (
      const selection of
      rawRace.selections ??
      []
    ) {
      const horseNumber =
        Number(
          selection.horseNumber
        );


      const direct =
        exact.get(
          canonicalKey(
            rawRace.city,
            Number(
              rawRace.raceNumber
            ),
            horseNumber
          )
        );


      const suppliedName =
        String(
          selection.horseName ??
          ""
        ).trim();


      if (direct) {
        if (
          !suppliedName ||
          normalizeExpertHorseName(
            suppliedName
          ) ===
          normalizeExpertHorseName(
            direct.horseName
          )
        ) {
          addSelection(
            direct,
            selection
          );

          continue;
        }
      }


      if (suppliedName) {
        const matches =
          canonical.filter(
            runner =>
              normalizedCity(
                runner.city
              ) ===
                normalizedCity(
                  rawRace.city
                ) &&
              runner.horseNumber ===
                horseNumber &&
              normalizeExpertHorseName(
                runner.horseName
              ) ===
                normalizeExpertHorseName(
                  suppliedName
                )
          );


        if (
          matches.length ===
          1
        ) {
          const repaired =
            matches[0];


          addSelection(
            repaired,
            selection
          );


          repairs.push({
            from:{
              city:
                rawRace.city,

              raceNumber:
                rawRace.raceNumber,

              horseNumber,

              horseName:
                suppliedName
            },

            to:{
              city:
                repaired.city,

              raceNumber:
                repaired.raceNumber,

              horseNumber:
                repaired.horseNumber,

              horseName:
                repaired.horseName
            }
          });


          continue;
        }
      }


      dropped.push({
        type:
          "selection",

        city:
          rawRace.city,

        raceNumber:
          rawRace.raceNumber,

        horseNumber,

        horseName:
          selection.horseName ??
          null
      });
    }


    for (
      const group of
      rawRace.numberGroups ??
      []
    ) {
      for (
        const rawNumber of
        group.horseNumbers ??
        []
      ) {
        const horseNumber =
          Number(
            rawNumber
          );


        const runner =
          exact.get(
            canonicalKey(
              rawRace.city,
              Number(
                rawRace.raceNumber
              ),
              horseNumber
            )
          );


        if (!runner) {
          dropped.push({
            type:
              "number-group",

            city:
              rawRace.city,

            raceNumber:
              rawRace.raceNumber,

            horseNumber,

            label:
              group.label
          });

          continue;
        }


        addSelection(
          runner,
          {
            horseNumber:
              runner.horseNumber,

            horseName:
              runner.horseName,

            comment:null,

            labels:[
              group.label
            ]
          }
        );
      }
    }
  }


  const value:
    RawExpertExtraction = {
      races:[
        ...buckets.values()
      ]
        .map(
          bucket => ({
            city:
              bucket.city,

            raceNumber:
              bucket.raceNumber,

            selections:[
              ...bucket
                .selections
                .values()
            ],

            numberGroups:[]
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            a.city.localeCompare(
              b.city,
              "tr"
            ) ||
            a.raceNumber -
            b.raceNumber
        )
  };


  return {
    value,

    diagnostics:{
      inputRaceCount:
        raw.races.length,

      outputRaceCount:
        value.races.length,

      repairs,
      dropped,

      repairedCount:
        repairs.length,

      droppedCount:
        dropped.length
    }
  };
}
