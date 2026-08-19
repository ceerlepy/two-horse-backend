import type {
  Env
} from "../env";

import type {
  HorseHistoryRun
} from "./types";

import {
  acquireAndParse
} from "../acquisition/deterministic";

import {
  parseHorseHistoryPage
} from "./history-parser";

import {
  validateHorseHistory
} from "./history-validator";

import {
  extractHorseHistorySemantic
} from "./semantic-extractor";

export interface AcquiredHorseHistory {
  rows:
    HorseHistoryRun[];

  method:
    string;

  diagnostics:
    unknown;
}

/*
 * FORM acquisition:
 *
 * HTTP -> deterministic parser
 * CF_SCRAPE -> same parser
 * CF_CONTENT -> same parser
 * CF_JSON -> strict schema, last resort
 *
 * Cache fallback is deliberately handled
 * by the service/repository layer.
 */
export async function acquireHorseHistory(
  env: Env,
  url: string
): Promise<AcquiredHorseHistory> {
  try {
    const result =
      await acquireAndParse(
        env,
        url,
        parseHorseHistoryPage,
        validateHorseHistory
      );

    return {
      rows:
        result.value,

      method:
        result.acquired.stage,

      diagnostics:
        result.diagnostics
    };
  } catch (
    deterministicError
  ) {
    const semantic =
      await extractHorseHistorySemantic(
        env,
        url
      );

    validateHorseHistory(
      semantic.rows
    );

    return {
      rows:
        semantic.rows,

      method:
        semantic.method,

      diagnostics: {
        deterministicError:
          deterministicError
            instanceof Error
            ? deterministicError.message
            : String(
                deterministicError
              )
      }
    };
  }
}
