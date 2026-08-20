import type { Env } from "../env";

import {
  errorMessage,
  sha256
} from "../shared";

import {
  getState,
  isDue,
  acquireLease,
  markFailure,
  markSuccess
} from "../storage/state";

import {
  upsertProgram
} from "../storage/program-repository";

import {
  recordAgfSnapshots
} from "../market/repository";

import {
  adaptiveTjkPolicy
} from "../market/refresh-policy";

import {
  assertCanonicalTjkProgram
} from "./meeting-classification";

import {
  getTjkProgramUrl,
  rediscoverTjkProgramUrl
} from "./registry";

import {
  extractTjkProgramWithFallbacks,
  TjkExtractionError,
  type TjkDiagnostic
} from "./extraction-pipeline";

const KEY = "tjk:program";

/*
 * Canonical program + live AGF share ONE validated
 * TJK acquisition.
 *
 * Adaptive cadence determines how often that one
 * acquisition runs.
 */

function summarizeTjkDiagnostics(
  diagnostics:
    TjkDiagnostic[]
): {
  fallbackUsed: boolean;
  browserFallbackUsed: boolean;
  successfulStages: string[];
} {
  const successfulStages =
    diagnostics
      .filter(
        item => item.ok
      )
      .map(
        item =>
          `${item.scope}:${item.stage}`
      );

  const browserFallbackUsed =
    diagnostics.some(
      item =>
        item.ok &&
        (
          item.stage ===
            "CF_SCRAPE" ||
          item.stage ===
            "SCRAPE_PARSE" ||
          item.stage ===
            "CF_CONTENT" ||
          item.stage ===
            "CONTENT_PARSE" ||
          item.stage ===
            "CF_JSON" ||
          item.stage ===
            "JSON_VALIDATE"
        )
    );

  return {
    fallbackUsed:
      diagnostics.some(
        item =>
          !item.ok
      ) ||
      browserFallbackUsed,

    browserFallbackUsed,

    successfulStages
  };
}

export async function refreshProgramIfDue(
  env: Env,
  force = false
): Promise<{
  refreshed: boolean;
  reason: string;
  diagnostics: TjkDiagnostic[];

  acquisitionSummary: {
    fallbackUsed: boolean;
    browserFallbackUsed: boolean;
    successfulStages: string[];
  };
}> {
  const state = await getState(
    env,
    KEY
  );

  const policy =
    await adaptiveTjkPolicy(
      env
    );

  if (
    !force &&
    !isDue(
      state,
      policy.ttlMs
    )
  ) {
    return {
      refreshed: false,
      reason:
        `fresh:${policy.reason}`,

      diagnostics: [],

      acquisitionSummary: {
        fallbackUsed: false,
        browserFallbackUsed: false,
        successfulStages: []
      }
    };
  }

  if (
    !await acquireLease(
      env,
      KEY,
      180
    )
  ) {
    return {
      refreshed: false,
      reason:
        "already-refreshing",

      diagnostics: [],

      acquisitionSummary: {
        fallbackUsed: false,
        browserFallbackUsed: false,
        successfulStages: []
      }
    };
  }

  let diagnostics: TjkDiagnostic[] = [];

  try {
    /*
     * Registry is retained for future URL self-healing.
     * Extraction has a known-good canonical fallback internally.
     */
    let { url } =
      await getTjkProgramUrl(env);

    let extracted;

    try {
      extracted =
        await extractTjkProgramWithFallbacks(
          env,
          url
        );
    } catch (firstError) {
      if (
        firstError instanceof TjkExtractionError
      ) {
        diagnostics.push(
          ...firstError.diagnostics
        );
      }

      /*
       * Registry URL may genuinely have changed.
       */
      url =
        await rediscoverTjkProgramUrl(env);

      extracted =
        await extractTjkProgramWithFallbacks(
          env,
          url
        );
    }

    diagnostics.push(
      ...extracted.diagnostics
    );

    const program =
      extracted.program;

    /*
     * Hard canonical invariant.
     *
     * Nothing reaches AGF snapshots, D1, scoring or
     * coupons unless the programme is canonical.
     */
    assertCanonicalTjkProgram(
      program
    );

    /*
     * Snapshot after successful canonical validation,
     * BEFORE source-hash de-duplication.
     *
     * An unchanged AGF is still meaningful evidence
     * of a flat market.
     */
    await recordAgfSnapshots(
      env,
      program
    );

    const sourceHash = await sha256(
      JSON.stringify(program)
    );

    const existing =
      await env.DB
        .prepare(`
          SELECT source_hash
          FROM meetings
          WHERE race_date =
            date('now','+3 hours')
          LIMIT 1
        `)
        .first<any>();

    /*
     * Always reconcile the authoritative daily card.
     *
     * Even when the source hash is unchanged, stale rows
     * from a previous card/date transition may still exist
     * in D1 and must be removed.
     *
     * upsertProgram is idempotent for the current canonical
     * program and also performs stale-card cleanup.
     */
    await upsertProgram(
      env,
      program,
      sourceHash
    );

    await markSuccess(
      env,
      KEY
    );

    return {
      refreshed: true,

      reason:
        existing?.source_hash === sourceHash
          ? "unchanged"
          : "updated",

      diagnostics,

      acquisitionSummary:
        summarizeTjkDiagnostics(
          diagnostics
        )
    };
  } catch (error) {
    if (
      error instanceof TjkExtractionError
    ) {
      diagnostics.push(
        ...error.diagnostics
      );
    }

    const message =
      errorMessage(error);

    await markFailure(
      env,
      KEY,
      message
    );

    console.error(
      "TJK refresh failed",
      {
        message,
        diagnostics
      }
    );

    /*
     * Last known good D1 data remains untouched.
     */
    throw new Error(
      `${message}\nDIAGNOSTICS=${JSON.stringify(
        diagnostics
      )}`
    );
  }
}
