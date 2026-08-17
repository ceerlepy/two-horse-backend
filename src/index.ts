export interface Env {
  AI: Ai;
  BROWSER: Fetcher;
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
