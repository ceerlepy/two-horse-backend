import type {
  Env
} from "../env";

import type {
  ExpertExtractionInput
} from "../types/models";

import {
  unwrapQuickActionJson
} from "../shared";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

import {
  expertSchema
} from "./schema";

import {
  expertExtractionPrompt
} from "./prompt";

export interface ExtractedExperts {
  extraction:
    ExpertExtractionInput;

  method: string;

  diagnostics: unknown;
}

export async function extractExperts(
  env: Env,
  url: string,
  sourceName: string
): Promise<ExtractedExperts> {
  const result =
    await extractSemanticJson<any>(
      env,
      url,
      expertExtractionPrompt(
        sourceName
      ),
      {
        type:
          "json_schema",

        json_schema:
          expertSchema
      }
    );

  /*
   * Keep compatibility with different Browser Run
   * result wrappers.
   */
  const value =
    unwrapQuickActionJson(
      result.value
    );

  if (
    !value ||
    !Array.isArray(
      value.picks
    )
  ) {
    throw new Error(
      "INVALID_EXPERT_EXTRACTION"
    );
  }

  return {
    extraction:
      value as ExpertExtractionInput,

    method:
      result.method,

    diagnostics:
      result.diagnostics
  };
}
