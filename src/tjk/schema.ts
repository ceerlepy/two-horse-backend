/**
 * JSON fallback deliberately uses a permissive schema.
 * Business integrity is enforced by our deterministic validator,
 * not delegated to the AI model.
 */
export const tjkMeetingJsonSchema = {
  type: "object",
  properties: {
    city: { type: "string" },
    races: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raceNumber: { type: "integer" },
          time: { type: "string" },
          distanceMeters: { type: ["integer", "null"] },
          track: { type: ["string", "null"] },
          runners: {
            type: "array",
            items: {
              type: "object",
              properties: {
                number: { type: "integer" },
                name: { type: "string" },
                jockey: { type: ["string", "null"] },
                weight: { type: ["number", "null"] },
                hp: { type: ["integer", "null"] },
                agfPercent: { type: ["number", "null"] }
              },
              required: ["number", "name"]
            }
          }
        },
        required: ["raceNumber", "time", "runners"]
      }
    }
  },
  required: ["city", "races"]
} as const;

export const tjkProgramSchema = {
  type: "object",
  properties: {
    meetings: {
      type: "array",
      items: tjkMeetingJsonSchema
    }
  },
  required: ["meetings"]
} as const;
