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
  extractSemanticJsonFromUrl,
  isCfJson422Failure
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
   * PRIMARY
   *
   * Keep transport/semantic execution separate from
   * application-level finalization.
   *
   * A successful Browser /json request is finalized only
   * after the try/catch below so an application parse
   * failure cannot be mislabeled as transport failure.
   */
  let primary:
    Awaited<
      ReturnType<
        typeof extractSemanticJsonFromUrl<any>
      >
    >;


  try {
    primary =
      await extractSemanticJsonFromUrl<any>(
        env,
        url,
        prompt,
        responseFormat
      );

  } catch (primaryTechnicalError) {
    /*
     * HTTP 422 means Browser /json reached structured
     * generation but could not produce an accepted
     * structured response.
     *
     * DO NOT immediately spend another AI call over the
     * same article while diagnosing the actual response.
     */
    if (
      isCfJson422Failure(
        primaryTechnicalError
      )
    ) {
      throw primaryTechnicalError;
    }


    /*
     * Other genuine technical failures retain the existing
     * emergency path:
     *
     * CONTENT(url)
     * -> JSON(html)
     */
    let content:
      Awaited<
        ReturnType<
          typeof acquireCfContentHtml
        >
      >;


    let fallback:
      Awaited<
        ReturnType<
          typeof extractSemanticJsonFromHtml<any>
        >
      >;


    try {
      content =
        await acquireCfContentHtml(
          env,
          url
        );


      fallback =
        await extractSemanticJsonFromHtml<any>(
          env,
          content.html,
          prompt,
          responseFormat
        );

    } catch (fallbackTechnicalError) {
      throw new Error(
        "EXPERT_EXTRACTION_TECHNICAL_FAILURE:" +
        JSON.stringify({
          primary:
            errorMessage(
              primaryTechnicalError
            ),

          fallback:
            errorMessage(
              fallbackTechnicalError
            )
        })
      );
    }


    return finalizeExtraction(
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
  }


  /*
   * HTTP success is NOT a transport failure even if our
   * own application parser rejects the returned shape.
   */
  return finalizeExtraction(
    primary.value,
    primary.method,
    primary.diagnostics
  );
}
