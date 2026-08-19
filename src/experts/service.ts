import type {
  Env
} from "../env";

import {
  errorMessage,
  sha256,
  turkeyDate
} from "../shared";

import {
  expertCheckIntervalMs
} from "./policy";

import {
  expertHttpFingerprint
} from "./fingerprint";

import {
  extractExperts
} from "./extractor";

import {
  validateExpertPicks
} from "./validator";

import {
  persistExpertPicks
} from "./persistence";

import {
  activeExpertSources,
  markExpertChecked,
  markExpertFailure,
  markExpertHealthy
} from "./source-repository";

import {
  mapLimit
} from "./concurrency";

import type {
  ExpertRefreshResult,
  ExpertSource
} from "./source-types";

async function nextRaceMinutes(
  env: Env
): Promise<number | null> {
  const row =
    await env.DB.prepare(`
      SELECT starts_at
      FROM races
      WHERE race_date = ?
        AND starts_at > ?
      ORDER BY starts_at
      LIMIT 1
    `)
      .bind(
        turkeyDate(),
        new Date()
          .toISOString()
      )
      .first<any>();

  if (!row?.starts_at) {
    return null;
  }

  return Math.max(
    0,
    (
      Date.parse(
        row.starts_at
      ) -
      Date.now()
    ) /
    60_000
  );
}

async function extractionHash(
  picks: unknown
): Promise<string> {
  /*
   * Stable semantic fallback when HTTP
   * fingerprinting is unavailable.
   *
   * This prevents Browser acquisition failure from
   * disabling persistence entirely.
   */
  return sha256(
    JSON.stringify(
      picks
    )
  );
}

async function processSource(
  env: Env,
  source: ExpertSource
): Promise<ExpertRefreshResult> {
  const url =
    source.last_working_url ??
    source.homepage_url;

  if (!url) {
    return {
      source:
        source.source_key,

      status:
        "no-url"
    };
  }

  /*
   * Cheap change detection only.
   *
   * This must never become a prerequisite for
   * semantic extraction.
   */
  const fingerprint =
    await expertHttpFingerprint(
      url
    );

  await markExpertChecked(
    env,
    source.source_key
  );

  if (
    fingerprint &&
    source.content_hash ===
      fingerprint.hash
  ) {
    /*
     * expert_predictions is partitioned by race_date.
     *
     * A fingerprint carried over from yesterday must
     * NOT prevent today's rows from being persisted.
     */
    const todayExists =
      await env.DB.prepare(`
        SELECT 1 AS found
        FROM expert_predictions
        WHERE
          race_date = ?
          AND source_key = ?
        LIMIT 1
      `)
        .bind(
          turkeyDate(),
          source.source_key
        )
        .first<any>();

    if (todayExists) {
      return {
        source:
          source.source_key,

        status:
          "unchanged"
      };
    }

    /*
     * Same page fingerprint, but no rows for today:
     * continue semantic extraction and persistence.
     */
  }

  /*
   * Semantic acquisition:
   *
   * 1 CF_JSON(url)
   * 2 scrape -> JSON(html)
   * 3 content -> JSON(html)
   */
  const extracted =
    await extractExperts(
      env,
      url,
      source.source_name
    );

  const extractedPicks =
    extracted
      .extraction
      .picks;

  const picks =
    await validateExpertPicks(
      env,
      extractedPicks
    );

  /*
   * Semantic extraction may succeed syntactically but
   * still describe yesterday / another meeting.
   *
   * Do NOT mark the source healthy when none of the
   * extracted picks match today's canonical TJK card.
   */
  if (
    picks.length === 0
  ) {
    throw new Error(
      `EXPERT_NO_VALID_TODAY_PICKS:` +
      `${source.source_key}:` +
      `extracted=${extractedPicks.length}`
    );
  }

  /*
   * Prefer raw-page HTTP fingerprint when available.
   *
   * If direct HTTP was unavailable, hash the extracted
   * semantic payload so we still have deterministic
   * source state.
   */
  const contentHash =
    fingerprint?.hash ??
    await extractionHash(
      extracted
        .extraction
        .picks
    );

  await persistExpertPicks(
    env,
    source.source_key,
    contentHash,
    picks
  );

  await markExpertHealthy(
    env,
    source.source_key,
    contentHash
  );

  return {
    source:
      source.source_key,

    status:
      "updated",

    count:
      picks.length,

    extractionMethod:
      extracted.method
  };
}

export async function refreshExpertsIfDue(
  env: Env,
  force = false
): Promise<any> {
  const minutes =
    await nextRaceMinutes(
      env
    );

  const interval =
    expertCheckIntervalMs(
      minutes
    );

  if (
    interval === null
  ) {
    return {
      refreshed:
        false,

      reason:
        "no-upcoming-race"
    };
  }

  const state =
    await env.DB.prepare(`
      SELECT
        MAX(last_checked_at)
          AS checked
      FROM source_registry
      WHERE enabled = 1
    `)
      .first<any>();

  if (
    !force &&
    state?.checked &&
    (
      Date.now() -
      Date.parse(
        state.checked
      )
    ) <
      interval
  ) {
    return {
      refreshed:
        false,

      reason:
        "fresh",

      nextRaceMinutes:
        minutes
    };
  }

  const sources =
    await activeExpertSources(
      env
    );

  /*
   * Browser semantic extraction is expensive.
   * Keep concurrency deliberately bounded.
   */
  const results =
    await mapLimit(
      sources,
      3,

      async source => {
        try {
          return await processSource(
            env,
            source
          );
        } catch (error) {
          await markExpertFailure(
            env,
            source.source_key
          );

          return {
            source:
              source.source_key,

            status:
              "failed",

            error:
              errorMessage(
                error
              )
          } satisfies
            ExpertRefreshResult;
        }
      }
    );

  return {
    refreshed:
      true,

    nextRaceMinutes:
      minutes,

    results
  };
}
