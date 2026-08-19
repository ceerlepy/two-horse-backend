import type {
  Env
} from "../env";

import {
  acquireAndParse
} from "../acquisition/deterministic";

import {
  parseTjkFieldPerformancePage,
  validateTjkFieldPerformancePage,
  type TjkFieldPerformancePage
} from "./tjk-performance-parser";

import {
  extractTjkFieldSemantic
} from "./semantic-extractor";


export interface AcquiredFieldPage {
  value:
    TjkFieldPerformancePage;

  method:
    string;

  diagnostics:
    unknown;
}


/*
 * FIELD acquisition invariant:
 *
 * Every successful acquisition route MUST return
 * exactly TjkFieldPerformancePage.
 *
 * Deterministic:
 *
 * HTTP
 *   -> parseTjkFieldPerformancePage
 *
 * CF_SCRAPE
 *   -> same parser
 *
 * CF_CONTENT
 *   -> same parser
 *
 * Semantic fallback:
 *
 * CF_JSON(url)
 *   -> strict schema
 *
 * CF_SCRAPE
 *   -> CF_JSON(html)
 *
 * CF_CONTENT
 *   -> CF_JSON(html)
 *
 * All routes end at:
 *
 * validateTjkFieldPerformancePage()
 */
export async function acquireTjkFieldPage(
  env: Env,
  url: string
): Promise<AcquiredFieldPage> {
  try {
    const deterministic =
      await acquireAndParse(
        env,
        url,
        parseTjkFieldPerformancePage,
        validateTjkFieldPerformancePage
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
      await extractTjkFieldSemantic(
        env,
        url
      );

    /*
     * CRITICAL:
     *
     * JSON does NOT bypass domain validation.
     *
     * It must satisfy the same validator used by
     * HTTP/SCRAPE/CONTENT.
     */
    validateTjkFieldPerformancePage(
      semantic.page
    );

    return {
      value:
        semantic.page,

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
