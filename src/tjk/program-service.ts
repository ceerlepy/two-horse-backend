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

const KEY =
  "tjk:program";

/*
 * Full canonical TJK program:
 * 60 dakika.
 *
 * AGF / market refresh bunun dışında,
 * ayrı lightweight pipeline olacak.
 */
const TTL_MS =
  60 * 60 * 1000;

export async function refreshProgramIfDue(
  env: Env,
  force = false
): Promise<{
  refreshed: boolean;
  reason: string;
  diagnostics:
    TjkDiagnostic[];
}> {
  const state =
    await getState(
      env,
      KEY
    );

  if (
    !force &&
    !isDue(
      state,
      TTL_MS
    )
  ) {
    return {
      refreshed: false,
      reason: "fresh",
      diagnostics: []
    };
  }

  /*
   * Aynı anda 100 kullanıcı refresh
   * etse bile yalnız 1 upstream refresh.
   */
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
      diagnostics: []
    };
  }

  let diagnostics:
    TjkDiagnostic[] = [];

  try {
    let { url } =
      await getTjkProgramUrl(
        env
      );

    let extracted;

    try {
      extracted =
        await extractTjkProgramWithFallbacks(
          env,
          url
        );
    } catch (firstError) {
      if (
        firstError instanceof
        TjkExtractionError
      ) {
        diagnostics.push(
          ...firstError
            .diagnostics
        );
      }

      /*
       * Master TJK URL gerçekten değiştiyse
       * registry recovery.
       */
      url =
        await rediscoverTjkProgramUrl(
          env
        );

      extracted =
        await extractTjkProgramWithFallbacks(
          env,
          url
        );
    }

    diagnostics.push(
      ...extracted
        .diagnostics
    );

    const program =
      extracted.program;

    const sourceHash =
      await sha256(
        JSON.stringify(
          program
        )
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
     * Aynı canonical veri ise gereksiz D1
     * write yapılmaz.
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
        existing?.source_hash ===
          sourceHash
          ? "unchanged"
          : "updated",

      diagnostics
    };
  } catch (error) {
    if (
      error instanceof
      TjkExtractionError
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
     * Mevcut sağlam D1 programı burada
     * ASLA silinmez.
     */
    throw new Error(
      `${message}\nDIAGNOSTICS=${JSON.stringify(
        diagnostics
      )}`
    );
  }
}
