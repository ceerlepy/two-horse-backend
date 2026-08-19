import type {
  Env
} from "../env";

import {
  acquireAndParse
} from "../acquisition/deterministic";

import {
  parseOfficialResultsHtml
} from "./parser";

import {
  validateOfficialResults
} from "./validator";

import {
  extractOfficialResultsSemantic
} from "./semantic";

import type {
  OfficialMeetingResults
} from "./types";


export interface AcquiredOfficialResults {
  value: OfficialMeetingResults;
  method: string;
  diagnostics: unknown;
}


/*
 * OFFICIAL RESULT ACQUISITION CONTRACT
 *
 * HTTP
 *   -> same HTML parser
 *
 * CF_SCRAPE
 *   -> same HTML parser
 *
 * CF_CONTENT
 *   -> same HTML parser
 *
 * then, only if deterministic acquisition fails:
 *
 * CF_JSON(url)
 * CF_SCRAPE -> JSON(html)
 * CF_CONTENT -> JSON(html)
 *
 * EVERY path ends in the SAME
 * validateOfficialResults().
 */
export async function acquireOfficialResults(
  env: Env,
  input: {
    url: string;
    city: string;
    raceDate: string;
  }
): Promise<AcquiredOfficialResults> {
  try {
    const deterministic =
      await acquireAndParse(
        env,
        input.url,

        html =>
          parseOfficialResultsHtml(
            html,
            input.city,
            input.raceDate
          ),

        validateOfficialResults
      );

    return {
      value:
        deterministic.value,

      method:
        deterministic.acquired.stage,

      diagnostics:
        deterministic.diagnostics
    };
  } catch (
    deterministicError
  ) {
    const semantic =
      await extractOfficialResultsSemantic(
        env,
        input.url,
        input.city,
        input.raceDate
      );

    /*
     * JSON is never trusted merely because its
     * schema parsed successfully.
     */
    validateOfficialResults(
      semantic.value
    );

    return {
      value:
        semantic.value,

      method:
        semantic.method,

      diagnostics: {
        deterministicError:
          deterministicError
            instanceof Error
              ? deterministicError.message
              : String(
                  deterministicError
                ),

        semantic:
          semantic.diagnostics
      }
    };
  }
}
