import type {
  Env
} from "../env";

import {
  acquireCfContentHtml,
  acquireCfScrapeHtml
} from "./cloudflare-html";

import type {
  AcquisitionDiagnostics,
  SemanticJsonResult
} from "./types";

function message(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

async function jsonRequest<T>(
  env: Env,
  input:
    | {
        url: string;
      }
    | {
        html: string;
      },
  prompt: string,
  responseFormat?: unknown
): Promise<T> {
  const response =
    await env.BROWSER.quickAction(
      "json",
      {
        ...input,

        /*
         * URL input owns a browser navigation.
         *
         * Wait for dynamic page activity before asking
         * JSON AI to extract the rendered article.
         *
         * HTML input is already acquired/rendered and
         * therefore does not need gotoOptions.
         */
        ...(
          "url" in input
            ? {
                gotoOptions: {
                  waitUntil:
                    "networkidle2",

                  timeout:
                    30_000
                }
              }
            : {}
        ),

        prompt,

        ...(responseFormat
          ? {
              response_format:
                responseFormat
            }
          : {})
      } as any
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `CF_JSON_${response.status}:${body.slice(
        0,
        500
      )}`
    );
  }

  const raw:
    any =
    await response.json();

  /*
   * Browser Run bindings may wrap the actual result.
   */
  if (
    raw &&
    typeof raw === "object" &&
    "result" in raw
  ) {
    return raw.result as T;
  }

  return raw as T;
}

/*
 * Direct semantic URL extraction.
 *
 * Contract:
 *
 * - NO acquisition fallback happens here.
 * - A technically valid semantic response is returned as-is,
 *   including an empty picks array.
 * - Only Browser Run / JSON transport failure throws.
 *
 * This allows callers to distinguish:
 *
 * semantic empty
 *
 * from:
 *
 * technical acquisition failure.
 */
export async function extractSemanticJsonFromUrl<T>(
  env: Env,
  url: string,
  prompt: string,
  responseFormat?: unknown
): Promise<SemanticJsonResult<T>> {
  const diagnostics:
    AcquisitionDiagnostics = {
      failures: []
    };


  try {
    return {
      value:
        await jsonRequest<T>(
          env,
          {
            url
          },
          prompt,
          responseFormat
        ),

      method:
        "cf-json-url",

      diagnostics
    };

  } catch (error) {
    diagnostics.failures.push({
      stage:
        "cf-json-url",

      error:
        message(error)
    });


    throw new Error(
      `SEMANTIC_URL_EXTRACTION_FAILED:${JSON.stringify(
        diagnostics
      )}`
    );
  }
}


/*
 * Semantic extraction for HTML that has ALREADY been acquired.
 *
 * Cloudflare JSON natively accepts { html }.
 * Do NOT convert already-acquired HTML into a synthetic data: URL.
 */
export async function extractSemanticJsonFromHtml<T>(
  env: Env,
  html: string,
  prompt: string,
  responseFormat?: unknown
): Promise<SemanticJsonResult<T>> {
  const diagnostics:
    AcquisitionDiagnostics = {
      failures: []
    };

  try {
    return {
      value:
        await jsonRequest<T>(
          env,
          {
            html
          },
          prompt,
          responseFormat
        ),

      method:
        "cf-json-html",

      diagnostics
    };

  } catch (error) {
    diagnostics.failures.push({
      stage:
        "cf-json-html",

      error:
        message(error)
    });

    throw new Error(
      `SEMANTIC_HTML_EXTRACTION_FAILED:${JSON.stringify(
        diagnostics
      )}`
    );
  }
}


/*
 * Semantic extraction strategy:
 *
 * 1. JSON(url) directly.
 *
 * This is intentionally first:
 * Browser Run already navigates/renders the URL,
 * so pre-rendering the same page would be redundant.
 *
 * 2. If direct semantic extraction fails:
 *    SCRAPE(url) -> JSON(html)
 *
 * 3. If that fails:
 *    CONTENT(url) -> JSON(html)
 */
export async function extractSemanticJson<T>(
  env: Env,
  url: string,
  prompt: string,
  responseFormat?: unknown
): Promise<SemanticJsonResult<T>> {
  const diagnostics:
    AcquisitionDiagnostics = {
      failures: []
    };

  try {
    return {
      value:
        await jsonRequest<T>(
          env,
          {
            url
          },
          prompt,
          responseFormat
        ),

      method:
        "cf-json-url",

      diagnostics
    };
  } catch (error) {
    diagnostics.failures.push({
      stage:
        "cf-json-url",

      error:
        message(error)
    });
  }

  try {
    const scraped =
      await acquireCfScrapeHtml(
        env,
        url
      );

    return {
      value:
        await jsonRequest<T>(
          env,
          {
            html:
              scraped.html
          },
          prompt,
          responseFormat
        ),

      method:
        "cf-json-scrape-html",

      diagnostics
    };
  } catch (error) {
    diagnostics.failures.push({
      stage:
        "cf-json-html",

      error:
        `SCRAPE:${message(error)}`
    });
  }

  try {
    const content =
      await acquireCfContentHtml(
        env,
        url
      );

    return {
      value:
        await jsonRequest<T>(
          env,
          {
            html:
              content.html
          },
          prompt,
          responseFormat
        ),

      method:
        "cf-json-content-html",

      diagnostics
    };
  } catch (error) {
    diagnostics.failures.push({
      stage:
        "cf-json-html",

      error:
        `CONTENT:${message(error)}`
    });
  }

  throw new Error(
    `SEMANTIC_EXTRACTION_FAILED:${JSON.stringify(
      diagnostics
    )}`
  );
}
