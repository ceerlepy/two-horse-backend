import type {
  Env
} from "../env";

import type {
  ExpertSource
} from "./source-types";

import {
  turkeyDate
} from "../shared";


export async function activeExpertSources(
  env:
    Env
): Promise<ExpertSource[]> {
  const result =
    await env.DB.prepare(`
      SELECT
        source_key,
        source_name,
        homepage_url,
        last_working_url,
        last_discovered_article_url,
        last_discovered_article_at,
        content_hash,
        last_checked_at,
        last_success_at,
        last_failure_at,
        consecutive_failures,
        source_type,
        base_weight
      FROM source_registry
      WHERE enabled = 1
      ORDER BY source_key
    `)
      .all<ExpertSource>();


  return (
    result.results ??
    []
  );
}


export async function recordExpertRefreshTrace(
  env:
    Env,

  sourceKey:
    string,

  phase:
    string,

  currentUrl:
    string | null = null,

  details:
    unknown = null,

  startedAt:
    string | null = null
): Promise<void> {
  const now =
    new Date()
      .toISOString();


  const effectiveStartedAt =
    phase ===
      "PROCESS_START"
      ? now
      : startedAt;


  await env.DB.prepare(`
    INSERT INTO expert_source_refresh_trace (
      source_key,
      phase,
      current_url,
      details_json,
      started_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)

    ON CONFLICT(source_key)
    DO UPDATE SET
      phase = excluded.phase,
      current_url = excluded.current_url,
      details_json = excluded.details_json,

      started_at =
        CASE
          WHEN excluded.phase = 'PROCESS_START'
            THEN excluded.started_at

          ELSE
            COALESCE(
              expert_source_refresh_trace.started_at,
              excluded.started_at
            )
        END,

      updated_at =
        excluded.updated_at
  `)
    .bind(
      sourceKey,
      phase,
      currentUrl,

      details ===
        null
        ? null
        : JSON.stringify(
            details
          ),

      effectiveStartedAt,
      now
    )
    .run();
}


export async function markExpertChecked(
  env:
    Env,

  sourceKey:
    string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE source_registry
    SET
      last_checked_at = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE source_key = ?
  `)
    .bind(
      new Date()
        .toISOString(),

      sourceKey
    )
    .run();
}


/*
 * Discovery success is weaker than extraction success.
 *
 * It records:
 *
 * article URL
 * landing URL
 * discovery method
 *
 * It deliberately does NOT write:
 *
 * last_working_url
 * last_extraction_method
 * last_success_at
 * health_status=healthy
 */
export async function recordExpertDiscovery(
  env:
    Env,

  sourceKey:
    string,

  articleUrl:
    string,

  discoveredFromUrl:
    string,

  discoveryMethod:
    string
): Promise<void> {
  const now =
    new Date()
      .toISOString();


  await env.DB.prepare(`
    UPDATE source_registry
    SET
      last_discovered_article_url = ?,
      last_discovered_article_at = ?,
      last_discovered_from_url = ?,
      last_discovery_method = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE source_key = ?
  `)
    .bind(
      articleUrl,
      now,
      discoveredFromUrl,
      discoveryMethod,
      sourceKey
    )
    .run();
}


export async function markExpertHealthy(
  env:
    Env,

  sourceKey:
    string,

  contentHash:
    string,

  workingUrl?:
    string | null,

  diagnostics?: {
    discoveredFromUrl?:
      string | null;

    discoveryMethod?:
      string | null;

    extractionMethod?:
      string | null;
  }
): Promise<void> {
  const now =
    new Date()
      .toISOString();


  await env.DB.prepare(`
    UPDATE source_registry
    SET
      content_hash = ?,

      last_working_url =
        COALESCE(
          ?,
          last_working_url
        ),

      last_discovered_from_url =
        COALESCE(
          ?,
          last_discovered_from_url
        ),

      last_discovery_method =
        COALESCE(
          ?,
          last_discovery_method
        ),

      last_extraction_method =
        COALESCE(
          ?,
          last_extraction_method
        ),

      health_status = 'healthy',
      last_success_at = ?,
      consecutive_failures = 0,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE source_key = ?
  `)
    .bind(
      contentHash,

      workingUrl ??
        null,

      diagnostics
        ?.discoveredFromUrl ??
        null,

      diagnostics
        ?.discoveryMethod ??
        null,

      diagnostics
        ?.extractionMethod ??
        null,

      now,
      sourceKey
    )
    .run();
}


export async function markExpertFailure(
  env:
    Env,

  sourceKey:
    string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE source_registry
    SET
      health_status = 'degraded',
      last_failure_at = ?,

      consecutive_failures =
        consecutive_failures + 1,

      updated_at =
        CURRENT_TIMESTAMP
    WHERE source_key = ?
  `)
    .bind(
      new Date()
        .toISOString(),

      sourceKey
    )
    .run();
}


export type ExpertOutcomeStatus =
  | "blocked"
  | "parse-error"
  | "no-picks-today";

/*
 * processSource has several non-throwing exit paths (no card
 * published today, every attempt access-restricted, extraction ran
 * but produced nothing usable) that used to leave health_status
 * untouched — so a source that had a real success three days ago
 * still reported "healthy" today with nothing to show for it. This
 * records what actually happened on *this* check, every time,
 * without touching last_success_at/content_hash (those still mark
 * when the source last genuinely contributed).
 */
export async function markExpertOutcome(
  env:
    Env,

  sourceKey:
    string,

  status:
    ExpertOutcomeStatus
): Promise<void> {
  await env.DB.prepare(`
    UPDATE source_registry
    SET
      health_status = ?,
      last_checked_at = ?,
      updated_at =
        CURRENT_TIMESTAMP
    WHERE source_key = ?
  `)
    .bind(
      status,

      new Date()
        .toISOString(),

      sourceKey
    )
    .run();
}


const FAILED_HEALTH_STATUSES =
  new Set([
    "degraded",
    "blocked",
    "parse-error"
  ]);

export interface ExpertSourceHealthRow {
  sourceKey: string;
  healthStatus: string;
  effectiveStatus: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  contributingToday: boolean;
}

export interface ExpertSourceHealthSummary {
  availableSources: number;
  contributingSources: number;
  staleSources: number;
  failedSources: number;
  sources: ExpertSourceHealthRow[];
}

/*
 * A source recorded "healthy" once and may never be checked again,
 * so the raw column would otherwise read healthy forever while it
 * has contributed nothing for days. Any other recorded status
 * (including "no-picks-today", which is an honest, non-broken
 * outcome) is left as-is regardless of when it was last checked.
 */
export function deriveEffectiveSourceStatus(
  healthStatus: string,
  lastCheckedAt: string | null,
  raceDate: string
): string {
  const checkedToday =
    typeof lastCheckedAt ===
      "string" &&
    lastCheckedAt
      .slice(0, 10) ===
      raceDate;

  return (
    healthStatus === "healthy" &&
    !checkedToday
  )
    ? "stale"
    : healthStatus;
}

/*
 * healthStatus reflects the last recorded outcome (see
 * markExpertOutcome/markExpertHealthy/markExpertFailure).
 * effectiveStatus additionally catches the case that motivated this
 * function: a source recorded "healthy" once and was never checked
 * again, so the raw column still reads healthy while it has
 * contributed nothing for days. "no-picks-today" is deliberately
 * excluded from staleSources/failedSources — a source that ran,
 * found no current-day card, and said so honestly is not broken.
 */
export async function summarizeExpertSourceHealth(
  env:
    Env,

  raceDate:
    string =
      turkeyDate()
): Promise<ExpertSourceHealthSummary> {
  const sources =
    await env.DB.prepare(`
      SELECT
        source_key,
        health_status,
        last_checked_at,
        last_success_at
      FROM source_registry
      WHERE enabled = 1
      ORDER BY source_key
    `)
      .all<any>();

  const contributing =
    await env.DB.prepare(`
      SELECT DISTINCT source_key
      FROM expert_predictions
      WHERE race_date = ?
    `)
      .bind(raceDate)
      .all<any>();

  const contributingKeys =
    new Set(
      (contributing.results ?? [])
        .map(row =>
          String(row.source_key)
        )
    );

  const rows: ExpertSourceHealthRow[] =
    (sources.results ?? [])
      .map(row => {
        const sourceKey =
          String(row.source_key);

        const healthStatus =
          String(
            row.health_status ??
              "unknown"
          );

        const lastCheckedAt =
          row.last_checked_at ??
            null;

        const effectiveStatus =
          deriveEffectiveSourceStatus(
            healthStatus,
            lastCheckedAt,
            raceDate
          );

        return {
          sourceKey,
          healthStatus,
          effectiveStatus,

          lastCheckedAt,

          lastSuccessAt:
            row.last_success_at ??
              null,

          contributingToday:
            contributingKeys.has(
              sourceKey
            )
        };
      });

  return {
    availableSources:
      rows.length,

    contributingSources:
      rows.filter(
        row =>
          row.contributingToday
      ).length,

    staleSources:
      rows.filter(
        row =>
          row.effectiveStatus ===
          "stale"
      ).length,

    failedSources:
      rows.filter(
        row =>
          FAILED_HEALTH_STATUSES.has(
            row.effectiveStatus
          )
      ).length,

    sources: rows
  };
}
