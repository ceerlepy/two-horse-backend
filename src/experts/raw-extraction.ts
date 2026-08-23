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
  typeof RAW_EXPERT_LABELS[number];


export interface RawExpertPick {
  city: string;

  raceNumber:
    number;

  horseNumber:
    number;

  horseName:
    string | null;

  comment:
    string | null;

  labels:
    RawExpertLabel[];
}


export interface RawExpertExtraction {
  picks:
    RawExpertPick[];
}


export const rawExpertSchema = {
  type:
    "object",

  properties: {
    picks: {
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

        required: [
          "city",
          "raceNumber",
          "horseNumber",
          "horseName",
          "comment",
          "labels"
        ]
      }
    }
  },

  required: [
    "picks"
  ]
} as const;


function cleanOptionalText(
  value:
    string | null | undefined
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
  city: string,
  raceNumber: number,
  horseNumber: number
): string {
  return [
    city
      .normalize("NFKC")
      .trim()
      .toLocaleUpperCase("tr-TR"),

    raceNumber,

    horseNumber
  ].join("|");
}


function extractionConfidence(
  horseName: string | null,
  comment: string | null
): number {
  /*
   * Deterministic source-reading confidence.
   *
   * This is NOT winning probability.
   *
   * Canonical TJK validation remains the hard identity
   * gate after this mapping.
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
   * Number-only rival:
   *
   * legitimate source format such as
   * "rakipler: 2-3-6".
   */
  return 0.85;
}


function mapRawPick(
  raw:
    RawExpertPick
): ExpertPickInput | null {
  const city =
    String(
      raw.city ??
      ""
    ).trim();


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
      Array.isArray(
        raw.labels
      )
        ? raw.labels.filter(
            (
              value
            ): value is RawExpertLabel =>
              (
                RAW_EXPERT_LABELS as
                  readonly string[]
              ).includes(
                String(value)
              )
          )
        : []
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

    /*
     * Ordinary prose does not establish a ranked list.
     */
    sourceRank:
      null,

    confidence:
      extractionConfidence(
        horseName,
        comment
      )
  };
}


export function mapRawExpertExtraction(
  raw:
    RawExpertExtraction
): ExpertExtractionInput {
  /*
   * One source/runner becomes one persisted row.
   *
   * If the source mentions the same runner more than once,
   * labels are merged rather than creating conflicting rows.
   */
  const merged =
    new Map<
      string,
      ExpertPickInput
    >();


  for (
    const rawPick of
    raw.picks ?? []
  ) {
    const mapped =
      mapRawPick(
        rawPick
      );


    if (!mapped) {
      continue;
    }


    const key =
      duplicateKey(
        mapped.city,
        mapped.raceNumber,
        mapped.horseNumber
      );


    const previous =
      merged.get(key);


    if (!previous) {
      merged.set(
        key,
        mapped
      );

      continue;
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


  return {
    picks:
      [
        ...merged.values()
      ]
  };
}
