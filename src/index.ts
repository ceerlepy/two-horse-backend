export interface Env {
  AI: Ai;
  BROWSER: BrowserRun;
  DB: D1Database;
  APP_NAME: string;
  APP_VERSION: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*"
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        app: env.APP_NAME,
        version: env.APP_VERSION,
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/api/today") {
      return json({
        date: new Date().toISOString().slice(0, 10),
        status: "backend-skeleton-ready",
        meetings: []
      });
    }

    if (url.pathname === "/api/debug/sources") {
      return getSources(env);
    }

    if (url.pathname.startsWith("/api/debug/discover/")) {
      const sourceKey = decodeURIComponent(
        url.pathname.replace("/api/debug/discover/", "")
      );

      return discoverSource(sourceKey, env);
    }

    return json(
      {
        error: "not_found",
        path: url.pathname
      },
      404
    );
  }
};

export async function getSources(env: Env): Promise<Response> {
  try {
    const result = await env.DB
      .prepare(`
        SELECT
          source_key,
          source_name,
          domain,
          homepage_url,
          health_status,
          discovery_confidence
        FROM source_registry
        ORDER BY source_name
      `)
      .all();

    return Response.json({
      ok: true,
      count: result.results.length,
      sources: result.results
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

async function discoverSource(
  sourceKey: string,
  env: Env
): Promise<Response> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const source = await env.DB.prepare(`
    SELECT
      source_key,
      source_name,
      domain,
      homepage_url,
      last_working_url,
      last_working_url_pattern,
      discovery_confidence
    FROM source_registry
    WHERE source_key = ?
    LIMIT 1
  `).bind(sourceKey).first();

  if (!source) {
    return Response.json(
      {
        ok: false,
        error: "source_not_found",
        sourceKey
      },
      { status: 404 }
    );
  }

  const targetUrl =
    (source.last_working_url as string | null) ||
    (source.homepage_url as string | null);

  if (!targetUrl) {
    return Response.json(
      {
        ok: false,
        error: "source_has_no_url",
        sourceKey
      },
      { status: 400 }
    );
  }

  try {
    const response = await env.BROWSER.quickAction("content", {
      url: targetUrl
    });

    const body = await response.text();
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;

    const status = response.ok ? "success" : "browser_error";

    await env.DB.prepare(`
      INSERT INTO source_runs (
        source_key,
        status,
        discovered_url,
        extraction_method,
        started_at,
        completed_at,
        duration_ms,
        error_code,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sourceKey,
      status,
      targetUrl,
      "browser_content",
      startedAt,
      completedAt,
      durationMs,
      response.ok ? null : String(response.status),
      response.ok ? null : body.slice(0, 1000)
    ).run();

    if (response.ok) {
      await env.DB.prepare(`
        UPDATE source_registry
        SET
          health_status = 'healthy',
          last_success_at = ?,
          consecutive_failures = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE source_key = ?
      `).bind(completedAt, sourceKey).run();
    } else {
      await env.DB.prepare(`
        UPDATE source_registry
        SET
          health_status = 'degraded',
          last_failure_at = ?,
          consecutive_failures = consecutive_failures + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE source_key = ?
      `).bind(completedAt, sourceKey).run();
    }

    return Response.json({
      ok: response.ok,
      sourceKey,
      sourceName: source.source_name,
      targetUrl,
      browserStatus: response.status,
      durationMs,
      bodyLength: body.length,
      preview: body.slice(0, 800)
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedMs;
    const message =
      error instanceof Error ? error.message : String(error);

    await env.DB.prepare(`
      INSERT INTO source_runs (
        source_key,
        status,
        discovered_url,
        extraction_method,
        started_at,
        completed_at,
        duration_ms,
        error_code,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sourceKey,
      "exception",
      targetUrl,
      "browser_content",
      startedAt,
      completedAt,
      durationMs,
      "exception",
      message
    ).run();

    await env.DB.prepare(`
      UPDATE source_registry
      SET
        health_status = 'down',
        last_failure_at = ?,
        consecutive_failures = consecutive_failures + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE source_key = ?
    `).bind(completedAt, sourceKey).run();

    return Response.json(
      {
        ok: false,
        sourceKey,
        error: message,
        durationMs
      },
      { status: 500 }
    );
  }
}
