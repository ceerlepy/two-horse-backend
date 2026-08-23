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
  extractSemanticJson,
  extractSemanticJsonFromHtml
} from "../acquisition/semantic-json";

import {
  acquireCfContentHtml,
  acquireCfScrapeHtml
} from "../acquisition/cloudflare-html";

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


function errorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function parseExtraction(
  value: unknown
): ExpertExtractionInput {
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
      "INVALID_EXPERT_EXTRACTION"
    );
  }

  return parsed as
    ExpertExtractionInput;
}


export async function extractExperts(
  env: Env,
  url: string,
  sourceName: string
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
      .bind(raceDate)
      .all<any>();


  const cities =
    (
      meetings.results ??
      []
    )
      .map(
        (row:any) =>
          String(row.city)
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
      expertSchema
  } as const;


  const attempts:any[] = [];


  /*
   * =====================================================
   * PRIMARY
   * JSON(article URL)
   *
   * semantic-json.ts already navigates URL input with
   * networkidle2 after PART 1.
   * =====================================================
   */
  const primary =
    await extractSemanticJson<any>(
      env,
      url,
      prompt,
      responseFormat
    );


  let extraction =
    parseExtraction(
      primary.value
    );


  let method =
    primary.method;


  attempts.push({
    method,

    extracted:
      extraction.picks.length,

    diagnostics:
      primary.diagnostics
  });


  if (
    extraction.picks.length > 0
  ) {
    return {
      extraction,
      method,

      diagnostics: {
        attempts
      }
    };
  }


  /*
   * =====================================================
   * EMPTY-RESULT SAFETY NET 1
   *
   * Technical JSON success with picks=[] is NOT enough
   * evidence that the rendered article has no card.
   *
   * If primary was direct JSON(url), explicitly scrape
   * the rendered body and run semantic JSON over HTML.
   * =====================================================
   */
  if (
    primary.method ===
      "cf-json-url"
  ) {
    try {
      const scraped =
        await acquireCfScrapeHtml(
          env,
          url
        );


      const semantic =
        await extractSemanticJsonFromHtml<any>(
          env,
          scraped.html,
          prompt,
          responseFormat
        );


      const candidate =
        parseExtraction(
          semantic.value
        );


      extraction =
        candidate;

      method =
        "cf-json-scrape-html";


      attempts.push({
        method,

        extracted:
          candidate.picks.length,

        bodyLength:
          scraped.bodyLength,

        diagnostics:
          semantic.diagnostics
      });


      if (
        candidate.picks.length > 0
      ) {
        return {
          extraction:
            candidate,

          method,

          diagnostics: {
            attempts
          }
        };
      }

    } catch (error) {
      attempts.push({
        method:
          "cf-json-scrape-html",

        error:
          errorMessage(error)
      });
    }
  }


  /*
   * =====================================================
   * EMPTY-RESULT SAFETY NET 2
   *
   * Fully rendered CONTENT -> JSON(html)
   *
   * Skip if the generic primary acquisition chain already
   * reached cf-json-content-html.
   * =====================================================
   */
  if (
    primary.method !==
      "cf-json-content-html"
  ) {
    try {
      const content =
        await acquireCfContentHtml(
          env,
          url
        );


      const semantic =
        await extractSemanticJsonFromHtml<any>(
          env,
          content.html,
          prompt,
          responseFormat
        );


      const candidate =
        parseExtraction(
          semantic.value
        );


      extraction =
        candidate;

      method =
        "cf-json-content-html";


      attempts.push({
        method,

        extracted:
          candidate.picks.length,

        bodyLength:
          content.bodyLength,

        diagnostics:
          semantic.diagnostics
      });


      if (
        candidate.picks.length > 0
      ) {
        return {
          extraction:
            candidate,

          method,

          diagnostics: {
            attempts
          }
        };
      }

    } catch (error) {
      attempts.push({
        method:
          "cf-json-content-html",

        error:
          errorMessage(error)
      });
    }
  }


  /*
   * Every usable representation returned a genuine
   * empty expert card.
   *
   * Only NOW may service.ts classify NO_CURRENT_CARD.
   */
  return {
    extraction,
    method,

    diagnostics: {
      attempts
    }
  };
}
