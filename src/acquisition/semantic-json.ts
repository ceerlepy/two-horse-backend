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
  error:
    unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function jsonParseError(
  error:
    unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


export interface CfJsonFailureAnalysis {
  status:
    number;

  responseBodyLength:
    number;

  responseJsonValid:
    boolean;

  responseJsonParseError:
    string | null;

  errors:
    unknown;

  browserMsUsed:
    string | null;

  contentType:
    string | null;

  rawAiResponsePresent:
    boolean;

  rawAiResponseLength:
    number | null;

  rawAiResponseJsonValid:
    boolean | null;

  rawAiResponseJsonParseError:
    string | null;

  rawAiResponseTopLevelKeys:
    string[] | null;

  rawAiResponsePickCount:
    number | null;

  rawAiResponseFirstPickKeys:
    string[] | null;

  rawAiResponseLastPickKeys:
    string[] | null;

  rawAiResponseTruncatedInDiagnostic:
    boolean;

  rawAiResponse:
    string | null;

  rawAiResponseTail:
    string | null;

  responseBodyPreview:
    string | null;
}


/*
 * Diagnose Cloudflare Browser Run /json failures without
 * guessing what happened.
 *
 * In particular HTTP 422 can contain rawAiResponse:
 *
 * - AI may have produced malformed/truncated JSON;
 * - AI may have produced valid JSON that failed schema;
 * - response formation may have failed for another reason.
 *
 * We preserve enough evidence to tell those apart.
 */
export function analyzeCfJsonFailure(
  status:
    number,

  body:
    string,

  browserMsUsed:
    string | null = null,

  contentType:
    string | null = null
): CfJsonFailureAnalysis {
  let parsedBody:
    any = null;

  let responseJsonValid =
    false;

  let responseJsonParseError:
    string | null = null;


  try {
    parsedBody =
      JSON.parse(
        body
      );

    responseJsonValid =
      true;

  } catch (error) {
    responseJsonParseError =
      jsonParseError(
        error
      );
  }


  const rawAiResponse =
    typeof parsedBody
      ?.rawAiResponse ===
      "string"
      ? parsedBody.rawAiResponse
      : null;


  let rawAiResponseJsonValid:
    boolean | null = null;

  let rawAiResponseJsonParseError:
    string | null = null;

  let rawAiResponseTopLevelKeys:
    string[] | null = null;

  let rawAiResponsePickCount:
    number | null = null;

  let rawAiResponseFirstPickKeys:
    string[] | null = null;

  let rawAiResponseLastPickKeys:
    string[] | null = null;


  if (rawAiResponse !== null) {
    try {
      const parsedRaw:
        any =
        JSON.parse(
          rawAiResponse
        );


      rawAiResponseJsonValid =
        true;


      if (
        parsedRaw &&
        typeof parsedRaw ===
          "object" &&
        !Array.isArray(
          parsedRaw
        )
      ) {
        rawAiResponseTopLevelKeys =
          Object.keys(
            parsedRaw
          );
      }


      if (
        Array.isArray(
          parsedRaw?.picks
        )
      ) {
        rawAiResponsePickCount =
          parsedRaw.picks.length;


        const first =
          parsedRaw.picks[0];


        const last =
          parsedRaw.picks[
            parsedRaw.picks.length -
            1
          ];


        if (
          first &&
          typeof first ===
            "object" &&
          !Array.isArray(
            first
          )
        ) {
          rawAiResponseFirstPickKeys =
            Object.keys(
              first
            );
        }


        if (
          last &&
          typeof last ===
            "object" &&
          !Array.isArray(
            last
          )
        ) {
          rawAiResponseLastPickKeys =
            Object.keys(
              last
            );
        }
      }

    } catch (error) {
      rawAiResponseJsonValid =
        false;

      rawAiResponseJsonParseError =
        jsonParseError(
          error
        );
    }
  }


  /*
   * Keep diagnostics bounded so a bad upstream response
   * cannot create an unbounded D1 trace row.
   *
   * 20k from the start + 2k tail is enough to diagnose
   * normal structured-output failures while retaining the
   * exact ending of a truncated model response.
   */
  const RAW_LIMIT =
    20_000;

  const TAIL_LIMIT =
    2_000;


  return {
    status,

    responseBodyLength:
      body.length,

    responseJsonValid,

    responseJsonParseError,

    errors:
      parsedBody?.errors ??
      null,

    browserMsUsed,

    contentType,

    rawAiResponsePresent:
      rawAiResponse !== null,

    rawAiResponseLength:
      rawAiResponse
        ?.length ??
      null,

    rawAiResponseJsonValid,

    rawAiResponseJsonParseError,

    rawAiResponseTopLevelKeys,

    rawAiResponsePickCount,

    rawAiResponseFirstPickKeys,

    rawAiResponseLastPickKeys,

    rawAiResponseTruncatedInDiagnostic:
      Boolean(
        rawAiResponse &&
        rawAiResponse.length >
          RAW_LIMIT
      ),

    rawAiResponse:
      rawAiResponse === null
        ? null
        : rawAiResponse.slice(
            0,
            RAW_LIMIT
          ),

    rawAiResponseTail:
      rawAiResponse === null
        ? null
        : rawAiResponse.slice(
            -TAIL_LIMIT
          ),

    responseBodyPreview:
      responseJsonValid
        ? null
        : body.slice(
            0,
            6_000
          )
  };
}


export function isCfJson422Failure(
  error:
    unknown
): boolean {
  return message(
    error
  ).includes(
    "CF_JSON_422:"
  );
}


/*
 * Extract a readable 422 analysis from the direct
 * Cloudflare error produced below.
 */
export function cfJson422AnalysisFromError(
  error:
    unknown
): CfJsonFailureAnalysis | null {
  const text =
    message(
      error
    );


  const marker =
    "CF_JSON_422:";


  const index =
    text.indexOf(
      marker
    );


  if (index < 0) {
    return null;
  }


  const payload =
    text.slice(
      index +
      marker.length
    );


  try {
    return JSON.parse(
      payload
    ) as
      CfJsonFailureAnalysis;

  } catch {
    return null;
  }
}


async function jsonRequest<T>(
  env:
    Env,

  input:
    | {
        url:
          string;
      }
    | {
        html:
          string;
      },

  prompt:
    string,

  responseFormat?:
    unknown
): Promise<T> {
  const response =
    await env.BROWSER.quickAction(
      "json",
      {
        ...input,

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

        ...(
          responseFormat
            ? {
                response_format:
                  responseFormat
              }
            : {}
        )
      } as any
    );


  if (!response.ok) {
    const body =
      await response.text();


    const analysis =
      analyzeCfJsonFailure(
        response.status,
        body,

        response.headers.get(
          "X-Browser-Ms-Used"
        ),

        response.headers.get(
          "content-type"
        )
      );


    throw new Error(
      `CF_JSON_${response.status}:` +
      JSON.stringify(
        analysis
      )
    );
  }


  const raw:
    any =
    await response.json();


  if (
    raw &&
    typeof raw ===
      "object" &&
    "result" in raw
  ) {
    return raw.result as T;
  }


  return raw as T;
}


/*
 * Direct URL semantic extraction.
 *
 * Important:
 *
 * HTTP 422 is preserved as its own error class rather than
 * being hidden inside generic acquisition diagnostics.
 *
 * This lets the caller distinguish structured-output
 * formation failure from transport/rendering failure.
 */
export async function extractSemanticJsonFromUrl<T>(
  env:
    Env,

  url:
    string,

  prompt:
    string,

  responseFormat?:
    unknown
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
    /*
     * Preserve the exact structured-output diagnosis.
     *
     * Do not bury it under another JSON-string layer.
     */
    if (
      isCfJson422Failure(
        error
      )
    ) {
      throw error;
    }


    diagnostics.failures.push({
      stage:
        "cf-json-url",

      error:
        message(
          error
        )
    });


    throw new Error(
      `SEMANTIC_URL_EXTRACTION_FAILED:` +
      JSON.stringify(
        diagnostics
      )
    );
  }
}


/*
 * Semantic extraction for HTML that has already been
 * acquired/rendered.
 */
export async function extractSemanticJsonFromHtml<T>(
  env:
    Env,

  html:
    string,

  prompt:
    string,

  responseFormat?:
    unknown
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
    if (
      isCfJson422Failure(
        error
      )
    ) {
      throw error;
    }


    diagnostics.failures.push({
      stage:
        "cf-json-html",

      error:
        message(
          error
        )
    });


    throw new Error(
      `SEMANTIC_HTML_EXTRACTION_FAILED:` +
      JSON.stringify(
        diagnostics
      )
    );
  }
}


/*
 * Generic semantic acquisition chain used elsewhere.
 *
 * Discovery behavior remains unchanged.
 */
export async function extractSemanticJson<T>(
  env:
    Env,

  url:
    string,

  prompt:
    string,

  responseFormat?:
    unknown
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
        message(
          error
        )
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
        `SCRAPE:${message(
          error
        )}`
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
        `CONTENT:${message(
          error
        )}`
    });
  }


  throw new Error(
    `SEMANTIC_EXTRACTION_FAILED:` +
    JSON.stringify(
      diagnostics
    )
  );
}
