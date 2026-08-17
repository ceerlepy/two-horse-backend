export const tjkProgramSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    meetings: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", minLength: 1 },
          races: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                raceNumber: { type: "integer", minimum: 1 },
                time: {
                  type: "string",
                  pattern: "^([01]\\d|2[0-3]):[0-5]\\d$"
                },
                distanceMeters: {
                  anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }]
                },
                track: {
                  anyOf: [{ type: "string", minLength: 1 }, { type: "null" }]
                },
                runners: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      number: { type: "integer", minimum: 1 },
                      name: { type: "string", minLength: 1 },
                      jockey: { anyOf: [{ type: "string" }, { type: "null" }] },
                      weight: { anyOf: [{ type: "number" }, { type: "null" }] },
                      hp: { anyOf: [{ type: "integer" }, { type: "null" }] },
                      agfPercent: { anyOf: [{ type: "number" }, { type: "null" }] }
                    },
                    required: ["number","name","jockey","weight","hp","agfPercent"]
                  }
                }
              },
              required: ["raceNumber","time","distanceMeters","track","runners"]
            }
          }
        },
        required: ["city","races"]
      }
    }
  },
  required: ["meetings"]
} as const;
