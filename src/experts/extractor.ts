import type {
  Env
} from "../env";

import type {
  ExpertExtractionInput
} from "../types/models";

import {
  turkeyDate
} from "../shared";

import {
  acquireCfContentHtml
} from "../acquisition/cloudflare-html";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  expertArticleTextFromHtml
} from "./article-text";

import {
  mapRawExpertExtraction
} from "./raw-extraction";

import type {
  RawExpertExtraction
} from "./raw-extraction";

import {
  expertExtractionPrompt
} from "./prompt";

import {
  extractExpertJsonWithWorkersAi
} from "./workers-ai-extraction";


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


interface AcquiredExpertArticle {
  html:
    string;

  method:
    "cf-content" |
    "http-fallback";

  bodyLength:
    number;

  contentError:
    string | null;
}


function errorMessage(
  error:
    unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


async function acquireExpertArticle(
  env:
    Env,

  url:
    string
): Promise<AcquiredExpertArticle> {
  /*
   * CONTENT gives us the rendered source used for semantic
   * extraction without also invoking Workers AI.
   */
  try {
    const content =
      await acquireCfContentHtml(
        env,
        url
      );


    return {
      html:
        content.html,

      method:
        "cf-content",

      bodyLength:
        content.bodyLength,

      contentError:
        null
    };

  } catch (contentError) {
    /*
     * Browser rendering is an acquisition dependency, not
     * semantic truth.
     *
     * If CONTENT fails technically, ordinary HTTP gets one
     * AI-free chance before the source is declared failed.
     */
    try {
      const http =
        await acquireHttpHtml(
          url,
          {
            timeoutMs:
              12_000,

            minimumBytes:
              500
          }
        );


      return {
        html:
          http.html,

        method:
          "http-fallback",

        bodyLength:
          http.bodyLength,

        contentError:
          errorMessage(
            contentError
          )
      };

    } catch (httpError) {
      throw new Error(
        "EXPERT_ARTICLE_ACQUISITION_FAILED:" +
        JSON.stringify({
          content:
            errorMessage(
              contentError
            ),

          http:
            errorMessage(
              httpError
            )
        })
      );
    }
  }
}


function finalizeExtraction(
  raw:
    RawExpertExtraction,

  method:
    string,

  diagnostics:
    unknown
): ExtractedExperts {
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
      ...(
        diagnostics &&
        typeof diagnostics ===
          "object"
          ? diagnostics
          : {
              semantic:
                diagnostics
            }
      ),

      rawRaceCount:
        raw.races.length,

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
        (
          row:
            any
        ) =>
          String(
            row.city
          )
      );


  if (!cities.length) {
    throw new Error(
      "EXPERT_NO_CANONICAL_MEETINGS"
    );
  }


  const article =
    await acquireExpertArticle(
      env,
      url
    );


  const normalized =
    expertArticleTextFromHtml(
      article.html
    );


  if (
    normalized.text.length <
    200
  ) {
    throw new Error(
      `EXPERT_ARTICLE_TEXT_TOO_SMALL:${normalized.text.length}`
    );
  }


  const prompt =
    expertExtractionPrompt(
      sourceName,
      raceDate,
      cities
    );


  /*
   * Exactly ONE semantic extraction call.
   *
   * max_tokens is controlled by our Workers AI request.
   */
  const semantic =
    await extractExpertJsonWithWorkersAi(
      env,
      normalized.text,
      prompt
    );


  return finalizeExtraction(
    semantic.value,
    "cf-content-workers-ai-json",
    {
      acquisition: {
        method:
          article.method,

        bodyLength:
          article.bodyLength,

        contentError:
          article.contentError
      },

      articleText: {
        selectedRoot:
          normalized.selectedRoot,

        originalCharacters:
          normalized.originalCharacters,

        outputCharacters:
          normalized.outputCharacters,

        truncated:
          normalized.truncated
      },

      semantic:
        semantic.diagnostics
    }
  );
}
