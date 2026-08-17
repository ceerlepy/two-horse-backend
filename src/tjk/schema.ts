/*
 * Browser /json için schema bilinçli olarak sade tutulur.
 *
 * Format / semantic integrity kuralları AI schema'ya bırakılmaz.
 * Bunlar deterministic validator tarafından uygulanır.
 *
 * Böylece:
 * - Browser Run schema compatibility daha yüksek olur.
 * - AI çıktısı ile business validation birbirinden ayrılır.
 */

export const tjkMeetingJsonSchema = {
  type: "object",
  properties: {
    city: {
      type: "string"
    },
    races: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raceNumber: {
            type: "integer"
          },
          time: {
            type: "string"
          },
          distanceMeters: {
            type: "integer"
          },
          track: {
            type: "string"
          },
          runners: {
            type: "array",
            items: {
              type: "object",
              properties: {
                number: {
                  type: "integer"
                },
                name: {
                  type: "string"
                },
                jockey: {
                  type: "string"
                },
                weight: {
                  type: "number"
                },
                hp: {
                  type: "integer"
                },
                agfPercent: {
                  type: "number"
                }
              },
              required: [
                "number",
                "name"
              ]
            }
          }
        },
        required: [
          "raceNumber",
          "time",
          "runners"
        ]
      }
    }
  },
  required: [
    "city",
    "races"
  ]
} as const;

/*
 * Eski importları kırmamak için program schema export'u korunuyor.
 */
export const tjkProgramSchema = {
  type: "object",
  properties: {
    meetings: {
      type: "array",
      items: tjkMeetingJsonSchema
    }
  },
  required: [
    "meetings"
  ]
} as const;
