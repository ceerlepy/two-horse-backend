import type {
  Env
} from "../env";

import {
  rawExpertSchema
} from "./raw-extraction";

import type {
  RawExpertExtraction
} from "./raw-extraction";


export const DEFAULT_EXPERT_AI_MODEL =
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast";


export const EXPERT_AI_MAX_OUTPUT_TOKENS =
  4096;


export interface WorkersAiExpertResult {
  value:
    RawExpertExtraction;

  diagnostics: {
    model:
      string;

    maxTokens:
      number;

    articleCharacters:
      number;

    usage:
      unknown;
  };
}


function parseJsonString(
  value:
    string
): unknown {
  try {
    return JSON.parse(
      value
    );

  } catch (error) {
    throw new Error(
      "WORKERS_AI_EXPERT_JSON_PARSE_FAILED:" +
      (
        error instanceof Error
          ? error.message
          : String(error)
      ) +
      ":" +
      value.slice(
        0,
        4000
      )
    );
  }
}


/*
 * Workers AI JSON Mode can expose the structured result as:
 *
 * { response: <object> }
 *
 * or, depending on runtime/model typing:
 *
 * { response: "<json string>" }
 *
 * Keep the normalization in one place.
 */
export function parseWorkersAiExpertResponse(
  raw:
    unknown
): RawExpertExtraction {
  const envelope =
    raw as
      any;


  let value:
    unknown =
    (
      envelope &&
      typeof envelope ===
        "object" &&
      "response" in
        envelope
    )
      ? envelope.response
      : raw;


  if (
    typeof value ===
    "string"
  ) {
    value =
      parseJsonString(
        value
      );
  }


  if (
    !value ||
    typeof value !==
      "object" ||
    !Array.isArray(
      (
        value as
          any
      ).races
    )
  ) {
    throw new Error(
      "WORKERS_AI_INVALID_EXPERT_STRUCTURE:" +
      JSON.stringify(
        value
      )
        .slice(
          0,
          4000
        )
    );
  }


  return value as
    RawExpertExtraction;
}


export async function extractExpertJsonWithWorkersAi(
  env:
    Env,

  articleText:
    string,

  extractionPrompt:
    string
): Promise<WorkersAiExpertResult> {
  const model =
    String(
      env.AI_MODEL ??
      DEFAULT_EXPERT_AI_MODEL
    );


  const raw:
    any =
    await env.AI.run(
      model as any,

      {
        messages: [
          {
            role:
              "system",

            content:
              "You extract structured horse-racing expert selections. Return only data matching response_format. Never invent a horse, race or city."
          },

          {
            role:
              "user",

            content:
              [
                extractionPrompt,
                "",
                "KAYNAK METIN:",
                articleText
              ].join(
                "\n"
              )
          }
        ],

        response_format: {
          type:
            "json_schema",

          json_schema:
            rawExpertSchema
        },

        /*
         * Browser /json used the same Llama family but its
         * generated response was observed terminating at a
         * very small output budget.
         *
         * Direct Workers AI lets us control the ceiling.
         *
         * Billing follows actual tokens generated; this is
         * only the maximum allowed response size.
         */
        max_tokens:
          EXPERT_AI_MAX_OUTPUT_TOKENS,

        /*
         * Extraction is deterministic classification, not
         * creative generation.
         */
        temperature:
          0
      } as any
    );


  return {
    value:
      parseWorkersAiExpertResponse(
        raw
      ),

    diagnostics: {
      model,

      maxTokens:
        EXPERT_AI_MAX_OUTPUT_TOKENS,

      articleCharacters:
        articleText.length,

      usage:
        raw?.usage ??
        null
    }
  };
}
