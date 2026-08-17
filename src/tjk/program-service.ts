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
 * Canonical race structure changes slowly.
 * AGF / live market will use a separate adaptive pipeline.
 */
const TTL_MS =
  60 * 60 * 1000;

export async function refreshProgramIfDue(
  env: Env,
  force = false
): Promise<{
  refreshed: boolean;
  reason: string;
  diagnostics: TjkDiagnostic[];
}> {
  const state = await getState(
    env,
    KEY
  );

  if (
    !force &&
    !isDue(state, TTL_MS)
  ) {
    return {
      refreshed: false,
      reason: "fresh",
      diagnostics: []
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
      reason: "already-refreshing",
      diagnostics: []
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

    const program = extracted.program;

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
     * Only write when canonical data changed.
     */
    if (
      existing?.source_hash !==
      sourceHash
    ) {
      await upsertProgram(
        env,
        program,
        sourceHash
      );
    }

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

      diagnostics
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
