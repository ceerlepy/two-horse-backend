import type {
  Env
} from "../env";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

import type {
  OfficialMeetingResults
} from "./types";


export async function extractOfficialResultsSemantic(
  env: Env,
  url: string,
  city: string,
  raceDate: string
): Promise<{
  value: OfficialMeetingResults;
  method: string;
  diagnostics: unknown;
}> {
  const extracted =
    await extractSemanticJson<any>(
      env,
      url,
      `
Bu sayfa Türkiye Jokey Kulübü'nün resmi yarış
sonuç sayfasıdır.

YALNIZCA TAMAMLANMIŞ resmi yarış sonuçlarını çıkar.

Tahmin etme.
Canlı/geçici sıralamayı sonuç kabul etme.
Sayfada görünmeyen veriyi üretme.

Canonical çıktı:

{
  "city": "${city}",
  "raceDate": "${raceDate}",
  "races": [
    {
      "raceNumber": 1,
      "runners": [
        {
          "horseNumber": 1,
          "horseName": "AT ADI",
          "finishPosition": 1
        }
      ]
    }
  ]
}

Kurallar:

- raceNumber resmi koşu numarasıdır.
- horseNumber programdaki resmi at numarasıdır.
- horseName resmi görünen at ismidir.
- finishPosition yalnız resmi bitiriş sırasıdır.
- derecesiz/bitiriş derecesi olmayan at için 0 kullanılabilir.
- aynı atı iki kere üretme.
- aynı bitiriş sırasını iki ata verme.
- tamamlanmamış koşuyu races listesine ekleme.
- her tamamlanmış koşuda tam olarak bir winner,
  yani finishPosition=1 bulunmalıdır.
`.trim(),
      {
        type:
          "json_schema",

        json_schema: {
          name:
            "tjk_official_results",

          schema: {
            type:
              "object",

            additionalProperties:
              false,

            properties: {
              city: {
                type:
                  "string"
              },

              raceDate: {
                type:
                  "string"
              },

              races: {
                type:
                  "array",

                items: {
                  type:
                    "object",

                  additionalProperties:
                    false,

                  properties: {
                    raceNumber: {
                      type:
                        "integer"
                    },

                    runners: {
                      type:
                        "array",

                      items: {
                        type:
                          "object",

                        additionalProperties:
                          false,

                        properties: {
                          horseNumber: {
                            type:
                              "integer"
                          },

                          horseName: {
                            type:
                              "string"
                          },

                          finishPosition: {
                            type:
                              "integer"
                          }
                        },

                        required: [
                          "horseNumber",
                          "horseName",
                          "finishPosition"
                        ]
                      }
                    }
                  },

                  required: [
                    "raceNumber",
                    "runners"
                  ]
                }
              }
            },

            required: [
              "city",
              "raceDate",
              "races"
            ]
          }
        }
      }
    );

  const raw =
    extracted.value ?? {};

  const value:
    OfficialMeetingResults = {
      /*
       * Expected request identity wins over semantic
       * output. JSON cannot silently relabel a meeting.
       */
      city,
      raceDate,

      races:
        Array.isArray(raw.races)
          ? raw.races.map(
              (race:any) => ({
                raceNumber:
                  Number(
                    race.raceNumber
                  ),

                runners:
                  Array.isArray(
                    race.runners
                  )
                    ? race.runners.map(
                        (runner:any) => ({
                          horseNumber:
                            Number(
                              runner.horseNumber
                            ),

                          horseName:
                            String(
                              runner.horseName ??
                              ""
                            ).trim(),

                          finishPosition:
                            Number(
                              runner.finishPosition
                            )
                        })
                      )
                    : []
              })
            )
          : []
    };

  return {
    value,
    method:
      extracted.method,

    diagnostics:
      extracted.diagnostics
  };
}
