import type {
  Env
} from "../env";

import type {
  ExpertSource
} from "./source-types";

export async function activeExpertSources(
  env: Env
): Promise<ExpertSource[]> {
  const result =
    await env.DB.prepare(`
      SELECT
        source_key,
        source_name,
        homepage_url,
        last_working_url,
        content_hash,
        last_checked_at,
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

export async function markExpertChecked(
  env: Env,
  sourceKey: string
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

export async function markExpertHealthy(
  env: Env,
  sourceKey: string,
  contentHash: string,
  workingUrl?: string | null,
  diagnostics?: {
    discoveredFromUrl?: string | null;
    discoveryMethod?: string | null;
    extractionMethod?: string | null;
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
        COALESCE(?,last_working_url),

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
      workingUrl ?? null,
      now,
      sourceKey
    )
    .run();
}

export async function markExpertFailure(
  env: Env,
  sourceKey: string
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
