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


export interface WorkersAiExpertOptions {
  requireRace?:
    boolean;

  requireSelectionPerRace?:
    boolean;
}


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

    requireRace:
      boolean;

    requireSelectionPerRace:
      boolean;

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
 * Keep the generic raw schema unchanged for sources whose
 * publishing contract may differ.
 *
 * Liderform's verified "Koşuların analizi" contract has an
 * explicit main horse in every real analysis paragraph.
 *
 * Therefore only Liderform gets:
 *
 * selections.minItems = 1
 */
export function expertResponseSchemaFor(
  options:
    WorkersAiExpertOptions = {}
): any {
  const schema:
    any =
    JSON.parse(
      JSON.stringify(
        rawExpertSchema
      )
    );


  if (
    options.requireRace ===
    true
  ) {
    schema
      .properties
      .races
      .minItems = 1;
  }


  if (
    options.requireSelectionPerRace ===
    true
  ) {
    schema
      .properties
      .races
      .items
      .properties
      .selections
      .minItems = 1;
  }


  return schema;
}


export function parseWorkersAiExpertResponse(
  raw:
    unknown
): RawExpertExtraction {
  const envelope =
    raw as any;


  let value:
    unknown =
    (
      envelope &&
      typeof envelope ===
        "object" &&
      "response" in envelope
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
      (value as any).races
    )
  ) {
    throw new Error(
      "WORKERS_AI_INVALID_EXPERT_STRUCTURE:" +
      JSON.stringify(
        value
      ).slice(
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
    string,

  options:
    WorkersAiExpertOptions = {}
): Promise<WorkersAiExpertResult> {
  const model =
    String(
      env.AI_MODEL ??
      DEFAULT_EXPERT_AI_MODEL
    );


  const responseSchema =
    expertResponseSchemaFor(
      options
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
              "You extract structured horse-racing expert selections. Every explicit main horse in a real analysis paragraph must be preserved. Return only response_format data. Never invent a horse, race or city."
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
            responseSchema
        },

        max_tokens:
          EXPERT_AI_MAX_OUTPUT_TOKENS,

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

      requireRace:
        options.requireRace ===
        true,

      requireSelectionPerRace:
        options.requireSelectionPerRace ===
        true,

      usage:
        raw?.usage ??
        null
    }
  };
}
