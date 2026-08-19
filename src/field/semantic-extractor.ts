import type {
  Env
} from "../env";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

import type {
  TjkFieldHistoryRow,
  TjkFieldPerformancePage
} from "./tjk-performance-parser";


function textOrNull(
  value: unknown
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value)
      .trim();

  return text || null;
}


function integerOrNull(
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
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return null;
  }

  return Math.trunc(
    parsed
  );
}


function normalizedDate(
  value: unknown
): string | null {
  const text =
    textOrNull(value);

  if (!text) {
    return null;
  }

  /*
   * Preferred strict output from JSON:
   * YYYY-MM-DD
   */
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      text
    )
  ) {
    return text;
  }

  /*
   * Defensive support for visible TJK:
   * DD.MM.YYYY
   */
  const match =
    text.match(
      /^(\d{2})[.](\d{2})[.](\d{4})$/
    );

  if (!match) {
    return null;
  }

  return (
    `${match[3]}-` +
    `${match[2]}-` +
    `${match[1]}`
  );
}


export async function extractTjkFieldSemantic(
  env: Env,
  url: string
): Promise<{
  page: TjkFieldPerformancePage;
  method: string;
  diagnostics: unknown;
}> {
  const result =
    await extractSemanticJson<any>(
      env,
      url,
      `
Bu sayfa Türkiye Jokey Kulübü'nün
"Detaylı At Karşılaştırma" sayfasıdır.

Sayfadaki geçmiş koşu tablosunu çıkar.

SADECE sayfada açıkça görülen veriyi kullan.
Tahmin etme.
Eksik bilgiyi uydurma.

HTML parser ile AYNI canonical alanları döndür:

Her geçmiş koşu satırı için:

- horseName
- raceDate: YYYY-MM-DD
- venue
- distanceMeters
- track
- finishPosition

Kurallar:

- horseName görünür at ismidir.
- raceDate yalnız gerçek tarih ise yazılır.
- venue görünür hipodrom/şehir değeridir.
- distanceMeters sayı olmalıdır.
- track yalnız görünür pist değeridir:
  Kum, Çim veya Sentetik.
- finishPosition gerçek bitiriş sırasıdır.
- TJK "Derecesiz" gösteriyorsa finishPosition = 0.
- Görünmeyen optional alanlarda null kullan.
- Navigation/menu/tablo başlıklarını satır sanma.
- Aynı geçmiş koşuyu iki kere üretme.
`.trim(),
      {
        type:
          "json_schema",

        json_schema: {
          name:
            "tjk_field_performance",

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
                    horseName: {
                      type:
                        "string"
                    },

                    raceDate: {
                      type: [
                        "string",
                        "null"
                      ]
                    },

                    venue: {
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
                    }
                  },

                  required: [
                    "horseName",
                    "raceDate",
                    "venue",
                    "distanceMeters",
                    "track",
                    "finishPosition"
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
    TjkFieldHistoryRow[] =
    rawRows
      .map(
        (row:any) => ({
          horseName:
            String(
              row.horseName ??
              ""
            )
              .replace(
                /\s+/g,
                " "
              )
              .trim(),

          raceDate:
            normalizedDate(
              row.raceDate
            ),

          venue:
            textOrNull(
              row.venue
            ),

          distanceMeters:
            integerOrNull(
              row.distanceMeters
            ),

          track:
            textOrNull(
              row.track
            ),

          finishPosition:
            integerOrNull(
              row.finishPosition
            )
        })
      )
      .filter(
        (
          row:
            TjkFieldHistoryRow
        ) =>
          Boolean(
            row.horseName
          )
      );

  return {
    page: {
      /*
       * Semantic equivalent of:
       * deterministic parser successfully finding
       * the relevant TJK history table.
       */
      tableFound:
        true,

      rows
    },

    method:
      result.method,

    diagnostics:
      result.diagnostics
  };
}
