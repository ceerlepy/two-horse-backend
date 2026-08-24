import type {
  ExpertExtractionInput,
  ExpertPickInput
} from "../types/models";


export const RAW_EXPERT_LABELS = [
  "favorite",
  "banko",
  "strong",
  "star",
  "rival",
  "surprise",
  "avoid"
] as const;


export type RawExpertLabel =
  typeof RAW_EXPERT_LABELS[
    number
  ];


export interface RawExpertSelection {
  horseNumber:
    number;

  /*
   * Optional to avoid wasting output tokens writing null.
   */
  horseName?:
    string | null;

  comment?:
    string | null;

  labels:
    RawExpertLabel[];
}


export interface RawExpertNumberGroup {
  label:
    RawExpertLabel;

  horseNumbers:
    number[];
}


export interface RawExpertRace {
  city:
    string;

  raceNumber:
    number;

  /*
   * Named/commented individual selections.
   */
  selections:
    RawExpertSelection[];

  /*
   * Compact number-only source lists.
   *
   * Example source:
   *
   * Rakipler: 6-1-8
   *
   * Transport:
   *
   * label = rival
   * horseNumbers = [6,1,8]
   *
   * Application code expands this back into three
   * independent horse-level picks.
   */
  numberGroups:
    RawExpertNumberGroup[];
}


export interface RawExpertExtraction {
  races:
    RawExpertRace[];
}


export const rawExpertSchema = {
  type:
    "object",

  properties: {
    races: {
      type:
        "array",

      items: {
        type:
          "object",

        properties: {
          city: {
            type:
              "string"
          },

          raceNumber: {
            type:
              "integer"
          },

          selections: {
            type:
              "array",

            items: {
              type:
                "object",

              properties: {
                horseNumber: {
                  type:
                    "integer"
                },

                horseName: {
                  anyOf: [
                    {
                      type:
                        "string"
                    },
                    {
                      type:
                        "null"
                    }
                  ]
                },

                comment: {
                  anyOf: [
                    {
                      type:
                        "string"
                    },
                    {
                      type:
                        "null"
                    }
                  ]
                },

                labels: {
                  type:
                    "array",

                  minItems:
                    1,

                  items: {
                    type:
                      "string",

                    enum:
                      RAW_EXPERT_LABELS
                  }
                }
              },

              /*
               * horseName/comment are optional.
               *
               * This removes repeated:
               *
               * horseName:null
               * comment:null
               *
               * from number-light output.
               */
              required: [
                "horseNumber",
                "labels"
              ]
            }
          },

          numberGroups: {
            type:
              "array",

            items: {
              type:
                "object",

              properties: {
                label: {
                  type:
                    "string",

                  enum:
                    RAW_EXPERT_LABELS
                },

                horseNumbers: {
                  type:
                    "array",

                  minItems:
                    1,

                  items: {
                    type:
                      "integer"
                  }
                }
              },

              required: [
                "label",
                "horseNumbers"
              ]
            }
          }
        },

        required: [
          "city",
          "raceNumber",
          "selections",
          "numberGroups"
        ]
      }
    }
  },

  required: [
    "races"
  ]
} as const;


interface FlatRawPick {
  city:
    string;

  raceNumber:
    number;

  horseNumber:
    number;

  horseName?:
    string | null;

  comment?:
    string | null;

  labels:
    RawExpertLabel[];
}


function cleanOptionalText(
  value:
    string |
    null |
    undefined
): string | null {
  const cleaned =
    String(
      value ??
      ""
    )
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  return cleaned
    ? cleaned
    : null;
}


function duplicateKey(
  city:
    string,

  raceNumber:
    number,

  horseNumber:
    number
): string {
  return [
    city
      .normalize(
        "NFKC"
      )
      .trim()
      .toLocaleUpperCase(
        "tr-TR"
      ),

    raceNumber,

    horseNumber
  ].join(
    "|"
  );
}


function extractionConfidence(
  horseName:
    string | null,

  comment:
    string | null
): number {
  /*
   * Source-reading certainty.
   *
   * NOT winning probability.
   */
  if (
    horseName &&
    comment
  ) {
    return 0.95;
  }


  if (horseName) {
    return 0.90;
  }


  /*
   * Number-only source evidence, later resolved against
   * canonical TJK identity.
   */
  return 0.85;
}


function mapFlatRawPick(
  raw:
    FlatRawPick
): ExpertPickInput | null {
  const city =
    String(
      raw.city ??
      ""
    )
      .trim();


  const raceNumber =
    Number(
      raw.raceNumber
    );


  const horseNumber =
    Number(
      raw.horseNumber
    );


  if (
    !city ||
    !Number.isInteger(
      raceNumber
    ) ||
    raceNumber <= 0 ||
    !Number.isInteger(
      horseNumber
    ) ||
    horseNumber <= 0
  ) {
    return null;
  }


  const labels =
    new Set<RawExpertLabel>(
      (
        Array.isArray(
          raw.labels
        )
          ? raw.labels
          : []
      )
        .filter(
          (
            value
          ): value is RawExpertLabel =>
            (
              RAW_EXPERT_LABELS as
                readonly string[]
            )
              .includes(
                String(
                  value
                )
              )
        )
    );


  if (!labels.size) {
    return null;
  }


  const horseName =
    cleanOptionalText(
      raw.horseName
    );


  const comment =
    cleanOptionalText(
      raw.comment
    );


  return {
    city,
    raceNumber,
    horseNumber,
    horseName,
    comment,

    isFavorite:
      labels.has(
        "favorite"
      ),

    isBanko:
      labels.has(
        "banko"
      ),

    isStrong:
      labels.has(
        "strong"
      ),

    isStar:
      labels.has(
        "star"
      ),

    isRival:
      labels.has(
        "rival"
      ),

    isSurprise:
      labels.has(
        "surprise"
      ),

    isAvoid:
      labels.has(
        "avoid"
      ),

    sourceRank:
      null,

    confidence:
      extractionConfidence(
        horseName,
        comment
      )
  };
}


function mergeMappedPick(
  merged:
    Map<
      string,
      ExpertPickInput
    >,

  mapped:
    ExpertPickInput
): void {
  const key =
    duplicateKey(
      mapped.city,
      mapped.raceNumber,
      mapped.horseNumber
    );


  const previous =
    merged.get(
      key
    );


  if (!previous) {
    merged.set(
      key,
      mapped
    );

    return;
  }


  const previousCommentLength =
    previous.comment
      ?.length ??
    0;


  const mappedCommentLength =
    mapped.comment
      ?.length ??
    0;


  merged.set(
    key,
    {
      ...previous,

      horseName:
        previous.horseName ??
        mapped.horseName,

      comment:
        mappedCommentLength >
        previousCommentLength
          ? mapped.comment
          : previous.comment,

      isFavorite:
        previous.isFavorite ||
        mapped.isFavorite,

      isBanko:
        previous.isBanko ||
        mapped.isBanko,

      isStrong:
        previous.isStrong ||
        mapped.isStrong,

      isStar:
        previous.isStar ||
        mapped.isStar,

      isRival:
        previous.isRival ||
        mapped.isRival,

      isSurprise:
        previous.isSurprise ||
        mapped.isSurprise,

      isAvoid:
        previous.isAvoid ||
        mapped.isAvoid,

      confidence:
        Math.max(
          previous.confidence,
          mapped.confidence
        )
    }
  );
}


export function mapRawExpertExtraction(
  raw:
    RawExpertExtraction
): ExpertExtractionInput {
  const merged =
    new Map<
      string,
      ExpertPickInput
    >();


  for (
    const race of
    raw.races ??
    []
  ) {
    const city =
      String(
        race.city ??
        ""
      )
        .trim();


    const raceNumber =
      Number(
        race.raceNumber
      );


    /*
     * Explicit/named selections.
     */
    for (
      const selection of
      race.selections ??
      []
    ) {
      const mapped =
        mapFlatRawPick({
          city,
          raceNumber,

          horseNumber:
            Number(
              selection.horseNumber
            ),

          horseName:
            selection.horseName,

          comment:
            selection.comment,

          labels:
            selection.labels
        });


      if (mapped) {
        mergeMappedPick(
          merged,
          mapped
        );
      }
    }


    /*
     * Compact AI transport groups become separate
     * horse-level domain rows here.
     */
    for (
      const group of
      race.numberGroups ??
      []
    ) {
      const label =
        String(
          group.label ??
          ""
        ) as
          RawExpertLabel;


      if (
        !(
          RAW_EXPERT_LABELS as
            readonly string[]
        )
          .includes(
            label
          )
      ) {
        continue;
      }


      const uniqueNumbers =
        new Set<number>(
          (
            group.horseNumbers ??
            []
          )
            .map(
              Number
            )
            .filter(
              value =>
                Number.isInteger(
                  value
                ) &&
                value > 0
            )
        );


      for (
        const horseNumber of
        uniqueNumbers
      ) {
        const mapped =
          mapFlatRawPick({
            city,
            raceNumber,
            horseNumber,

            horseName:
              null,

            comment:
              null,

            labels: [
              label
            ]
          });


        if (mapped) {
          mergeMappedPick(
            merged,
            mapped
          );
        }
      }
    }
  }


  return {
    picks:
      [
        ...merged.values()
      ]
  };
}
