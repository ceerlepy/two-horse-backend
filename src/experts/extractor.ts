import type {
  Env
} from "../env";

import type {
  ExpertExtractionInput
} from "../types/models";

import {
  unwrapQuickActionJson,
  turkeyDate
} from "../shared";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

import {
  expertSchema
} from "./schema";

import {
  expertExtractionPrompt
} from "./prompt";

export interface ExtractedExperts {
  extraction:
    ExpertExtractionInput;

  method: string;

  diagnostics: unknown;
}

export async function extractExperts(
  env: Env,
  url: string,
  sourceName: string
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
      .bind(raceDate)
      .all<any>();

  const cities =
    (
      meetings.results ??
      []
    )
      .map(
        (row:any) =>
          String(row.city)
      );

  if (!cities.length) {
    throw new Error(
      "EXPERT_NO_CANONICAL_MEETINGS"
    );
  }

  const result =
    await extractSemanticJson<any>(
      env,
      url,
      expertExtractionPrompt(
        sourceName,
        raceDate,
        cities
      ),
      {
        type:
          "json_schema",

        json_schema:
          expertSchema
      }
    );

  /*
   * Keep compatibility with different Browser Run
   * result wrappers.
   */
  const value =
    unwrapQuickActionJson(
      result.value
    );

  if (
    !value ||
    !Array.isArray(
      value.picks
    )
  ) {
    throw new Error(
      "INVALID_EXPERT_EXTRACTION"
    );
  }

  return {
    extraction:
      value as ExpertExtractionInput,

    method:
      result.method,

    diagnostics:
      result.diagnostics
  };
}
