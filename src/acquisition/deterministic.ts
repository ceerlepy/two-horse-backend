import type {
  Env
} from "../env";

import {
  acquireHttpHtml
} from "./http";

import {
  acquireCfContentHtml,
  acquireCfScrapeHtml
} from "./cloudflare-html";

import type {
  AcquisitionDiagnostics,
  AcquiredHtml
} from "./types";

function message(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

export interface ParsedAcquisition<T> {
  value: T;

  acquired:
    AcquiredHtml;

  diagnostics:
    AcquisitionDiagnostics;
}

/*
 * Reusable deterministic acquisition engine.
 *
 * HTTP
 *   -> parser/validator
 *
 * CF_SCRAPE
 *   -> same parser/validator
 *
 * CF_CONTENT
 *   -> same parser/validator
 *
 * No AI is used here.
 */
export async function acquireAndParse<T>(
  env: Env,
  url: string,
  parser:
    (html: string) => T,
  validator:
    (value: T) => void
): Promise<ParsedAcquisition<T>> {
  const diagnostics:
    AcquisitionDiagnostics = {
      failures: []
    };

  const stages = [
    async () =>
      acquireHttpHtml(url),

    async () =>
      acquireCfScrapeHtml(
        env,
        url
      ),

    async () =>
      acquireCfContentHtml(
        env,
        url
      )
  ];

  for (
    const acquire of stages
  ) {
    let document:
      AcquiredHtml;

    try {
      document =
        await acquire();
    } catch (error) {
      /*
       * Stage is not available if acquisition
       * itself failed. Infer from iteration.
       */
      diagnostics.failures.push({
        stage:
          diagnostics.failures.length === 0
            ? "http"
            : diagnostics.failures.length === 1
              ? "cf-scrape"
              : "cf-content",

        error:
          message(error)
      });

      continue;
    }

    try {
      const value =
        parser(
          document.html
        );

      validator(value);

      return {
        value,
        acquired:
          document,
        diagnostics
      };
    } catch (error) {
      diagnostics.failures.push({
        stage:
          document.stage,

        error:
          `PARSE:${message(error)}`
      });
    }
  }

  throw new Error(
    `ACQUISITION_FAILED:${JSON.stringify(
      diagnostics
    )}`
  );
}
