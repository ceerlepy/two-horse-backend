import type {
  Env
} from "../env";

import type {
  ExpertExtractionInput
} from "../types/models";

import {
  unwrapQuickActionJson,
  turkeyDate
} from "../shared";

import {
  extractSemanticJsonFromHtml,
  extractSemanticJsonFromUrl
} from "../acquisition/semantic-json";

import {
  acquireCfContentHtml
} from "../acquisition/cloudflare-html";

import {
  mapRawExpertExtraction,
  rawExpertSchema
} from "./raw-extraction";

import type {
  RawExpertExtraction
} from "./raw-extraction";

import {
  expertExtractionPrompt
} from "./prompt";


export interface ExtractedExperts {
  extraction:
    ExpertExtractionInput;

  status:
    | "success"
    | "semantic-empty";

  method:
    string;

  diagnostics:
    unknown;
}


function errorMessage(
  error:
    unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function parseRawExtraction(
  value:
    unknown
): RawExpertExtraction {
  const parsed =
    unwrapQuickActionJson(
      value
    );


  if (
    !parsed ||
    !Array.isArray(
      parsed.picks
    )
  ) {
    throw new Error(
      "INVALID_RAW_EXPERT_EXTRACTION"
    );
  }


  return parsed as
    RawExpertExtraction;
}


function finalizeExtraction(
  value:
    unknown,

  method:
    string,

  diagnostics:
    unknown
): ExtractedExperts {
  const raw =
    parseRawExtraction(
      value
    );


  const extraction =
    mapRawExpertExtraction(
      raw
    );


  return {
    extraction,

    status:
      extraction.picks.length > 0
        ? "success"
        : "semantic-empty",

    method,

    diagnostics: {
      semantic:
        diagnostics,

      rawPickCount:
        raw.picks.length,

      mappedPickCount:
        extraction.picks.length
    }
  };
}


export async function extractExperts(
  env:
    Env,

  url:
    string,

  sourceName:
    string
): Promise<ExtractedExperts> {
  const raceDate =
    turkeyDate();


  const meetings =
    await env.DB.prepare(`
      SELECT city
      FROM meetings
      WHERE race_date = ?
      ORDER BY city
    `)
      .bind(
        raceDate
      )
      .all<any>();


  const cities =
    (
      meetings.results ??
      []
    )
      .map(
        (row:any) =>
          String(
            row.city
          )
      );


  if (!cities.length) {
    throw new Error(
      "EXPERT_NO_CANONICAL_MEETINGS"
    );
  }


  const prompt =
    expertExtractionPrompt(
      sourceName,
      raceDate,
      cities
    );


  const responseFormat = {
    type:
      "json_schema",

    json_schema:
      rawExpertSchema
  } as const;


  /*
   * PRIMARY EXTRACTION
   * ==================
   *
   * Exactly one ordinary semantic call:
   *
   * article/current-page URL
   * -> JSON(url)
   *
   * If the endpoint returns a valid structure containing
   * picks=[], that is a semantic result.
   *
   * It does NOT trigger another semantic AI call.
   */
  try {
    const primary =
      await extractSemanticJsonFromUrl<any>(
        env,
        url,
        prompt,
        responseFormat
      );


    return finalizeExtraction(
      primary.value,
      primary.method,
      primary.diagnostics
    );

  } catch (primaryTechnicalError) {
    /*
     * TECHNICAL EMERGENCY FALLBACK
     * ============================
     *
     * This branch exists only because the direct Browser
     * JSON call itself failed technically.
     *
     * CONTENT acquisition does not use Workers AI.
     *
     * After rendered HTML is acquired we allow exactly
     * one emergency JSON(html) semantic call.
     */
    try {
      const content =
        await acquireCfContentHtml(
          env,
          url
        );


      const fallback =
        await extractSemanticJsonFromHtml<any>(
          env,
          content.html,
          prompt,
          responseFormat
        );


      const finalized =
        finalizeExtraction(
          fallback.value,
          "cf-json-content-html",
          {
            primaryTechnicalError:
              errorMessage(
                primaryTechnicalError
              ),

            contentBodyLength:
              content.bodyLength,

            fallback:
              fallback.diagnostics
          }
        );


      return finalized;

    } catch (fallbackError) {
      throw new Error(
        "EXPERT_EXTRACTION_TECHNICAL_FAILURE:" +
        JSON.stringify({
          primary:
            errorMessage(
              primaryTechnicalError
            ),

          fallback:
            errorMessage(
              fallbackError
            )
        })
      );
    }
  }
}
