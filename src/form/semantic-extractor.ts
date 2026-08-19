import type {
  Env
} from "../env";

import type {
  HorseHistoryRun
} from "./types";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

function numberOrNull(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(
      String(value)
        .replace(",", ".")
    );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function integerOrNull(
  value: unknown
): number | null {
  const parsed =
    numberOrNull(value);

  return parsed === null
    ? null
    : Math.trunc(parsed);
}

export async function extractHorseHistorySemantic(
  env: Env,
  url: string
): Promise<{
  rows: HorseHistoryRun[];
  method: string;
}> {
  const result =
    await extractSemanticJson<any>(
      env,
      url,
      `
Bu TJK at profilindeki geçmiş koşu tablosunu çıkar.

Yalnızca açıkça görülen geçmiş koşuları kullan.
Tahmin veya yorum ekleme.

Her satır için:
- raceDate: YYYY-MM-DD
- city
- distanceMeters
- track
- finishPosition
- weight
- jockey
- odds
- hp

Bilgi görünmüyorsa null kullan.
Koşu olmayan navigation/menu satırlarını dahil etme.
`.trim(),
      {
        type:
          "json_schema",

        json_schema: {
          name:
            "horse_form_history",

          schema: {
            type:
              "object",

            additionalProperties:
              false,

            properties: {
              rows: {
                type:
                  "array",

                items: {
                  type:
                    "object",

                  additionalProperties:
                    false,

                  properties: {
                    raceDate: {
                      type:
                        "string"
                    },

                    city: {
                      type: [
                        "string",
                        "null"
                      ]
                    },

                    distanceMeters: {
                      type: [
                        "number",
                        "null"
                      ]
                    },

                    track: {
                      type: [
                        "string",
                        "null"
                      ]
                    },

                    finishPosition: {
                      type: [
                        "number",
                        "null"
                      ]
                    },

                    weight: {
                      type: [
                        "number",
                        "null"
                      ]
                    },

                    jockey: {
                      type: [
                        "string",
                        "null"
                      ]
                    },

                    odds: {
                      type: [
                        "number",
                        "null"
                      ]
                    },

                    hp: {
                      type: [
                        "number",
                        "null"
                      ]
                    }
                  },

                  required: [
                    "raceDate",
                    "city",
                    "distanceMeters",
                    "track",
                    "finishPosition",
                    "weight",
                    "jockey",
                    "odds",
                    "hp"
                  ]
                }
              }
            },

            required: [
              "rows"
            ]
          }
        }
      }
    );

  const rawRows =
    Array.isArray(
      result.value?.rows
    )
      ? result.value.rows
      : [];

  const rows:
    HorseHistoryRun[] =
    rawRows.map(
      (row: any) => ({
        raceDate:
          String(
            row.raceDate ?? ""
          ),

        city:
          row.city
            ? String(row.city)
            : null,

        distanceMeters:
          integerOrNull(
            row.distanceMeters
          ),

        track:
          row.track
            ? String(row.track)
            : null,

        finishPosition:
          integerOrNull(
            row.finishPosition
          ),

        weight:
          numberOrNull(
            row.weight
          ),

        jockey:
          row.jockey
            ? String(row.jockey)
            : null,

        odds:
          numberOrNull(
            row.odds
          ),

        hp:
          integerOrNull(
            row.hp
          )
      })
    );

  return {
    rows,

    method:
      result.method
  };
}
