export interface Env {
  AI: Ai;
  BROWSER: Fetcher;
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

    return json(
      {
        error: "not_found",
        path: url.pathname
      },
      404
    );
  }
};
