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

    if (url.pathname === "/api/debug/tjk-json") {
      return extractTjkProgram(env);
    }

    if (url.pathname === "/api/debug/tjk-source") {
      try {
        const result = await discoverTjkProgramUrl(env);

        return json({
          ok: true,
          source: "tjk_program",
          url: result.url,
          discoveredNow: result.discovered
        });
      } catch (error) {
        return json(
          {
            ok: false,
            source: "tjk_program",
            error: error instanceof Error ? error.message : String(error)
          },
          503
        );
      }
    }

    if (url.pathname === "/api/debug/tjk") {
      const targetUrl =
        "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";

      try {
        const response = await env.BROWSER.quickAction("content", {
          url: targetUrl,
          gotoOptions: {
            waitUntil: "networkidle2",
            timeout: 30000
          }
        });

        const body = await response.text();

        return json({
          ok: response.ok,
          targetUrl,
          browserStatus: response.status,
          bodyLength: body.length,
          preview: body.slice(0, 1000)
        });
      } catch (error) {
        return json(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          },
          500
        );
      }
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

async function discoverTjkProgramUrl(env: Env): Promise<{
  url: string;
  discovered: boolean;
}> {
  const registry = await env.DB.prepare(`
    SELECT
      homepage_url,
      last_working_url
    FROM main_source_registry
    WHERE source_key = 'tjk_program'
    LIMIT 1
  `).first();

  const currentUrl =
    (registry?.last_working_url as string | null) ||
    "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";

  // 1. Önce son çalışan URL'yi doğrula.
  try {
    const currentResponse = await env.BROWSER.quickAction("content", {
      url: currentUrl,
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 30000
      }
    });

    const currentBody = await currentResponse.text();

    if (
      currentResponse.ok &&
      currentBody.length > 10000 &&
      /Yarış Programı|YarisProgram|Günlük Yarış/i.test(currentBody)
    ) {
      await env.DB.prepare(`
        UPDATE main_source_registry
        SET
          health_status = 'healthy',
          last_success_at = ?,
          consecutive_failures = 0,
          discovery_confidence = 1.0,
          updated_at = CURRENT_TIMESTAMP
        WHERE source_key = 'tjk_program'
      `).bind(new Date().toISOString()).run();

      return {
        url: currentUrl,
        discovered: false
      };
    }
  } catch {
    // Discovery aşamasına düş.
  }

  // 2. Bilinen URL çalışmıyorsa TJK içindeki linkleri keşfet.
  const seedUrls = [
    "https://www.tjk.org/TR/YarisSever",
    "https://www.tjk.org/TR/YarisSever/Info",
    "https://www.tjk.org"
  ];

  const candidates = new Set<string>();

  for (const seedUrl of seedUrls) {
    try {
      const response = await env.BROWSER.quickAction("links", {
        url: seedUrl,
        excludeExternalLinks: true,
        gotoOptions: {
          waitUntil: "networkidle2",
          timeout: 30000
        }
      });

      const raw: any = await response.json();

      const links: string[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.result)
          ? raw.result
          : [];

      for (const link of links) {
        if (
          typeof link === "string" &&
          (
            /GunlukYarisProgrami/i.test(link) ||
            /GünlükYarışProgram/i.test(link) ||
            /YarisProgram/i.test(link)
          )
        ) {
          candidates.add(link);
        }
      }
    } catch {
      // Diğer seed URL'ye devam.
    }
  }

  // 3. Bulunan adayları gerçek Browser content çağrısıyla doğrula.
  for (const candidate of candidates) {
    try {
      const response = await env.BROWSER.quickAction("content", {
        url: candidate,
        gotoOptions: {
          waitUntil: "networkidle2",
          timeout: 30000
        }
      });

      const body = await response.text();

      if (
        response.ok &&
        body.length > 10000 &&
        /Yarış Programı|YarisProgram|Günlük Yarış/i.test(body)
      ) {
        const discoveredAt = new Date().toISOString();

        await env.DB.prepare(`
          UPDATE main_source_registry
          SET
            last_working_url = ?,
            last_working_url_pattern = ?,
            health_status = 'healthy',
            last_success_at = ?,
            last_discovered_at = ?,
            discovery_confidence = 0.95,
            consecutive_failures = 0,
            updated_at = CURRENT_TIMESTAMP
          WHERE source_key = 'tjk_program'
        `).bind(
          candidate,
          new URL(candidate).pathname,
          discoveredAt,
          discoveredAt
        ).run();

        return {
          url: candidate,
          discovered: true
        };
      }
    } catch {
      // Sonraki adaya devam.
    }
  }

  const failedAt = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE main_source_registry
    SET
      health_status = 'down',
      last_failure_at = ?,
      consecutive_failures = consecutive_failures + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE source_key = 'tjk_program'
  `).bind(failedAt).run();

  throw new Error("TJK program URL could not be discovered");
}

async function extractTjkProgram(env: Env): Promise<Response> {
  const source = await discoverTjkProgramUrl(env);

  const response = await env.BROWSER.quickAction("json", {
    url: source.url,
    gotoOptions: {
      waitUntil: "networkidle2",
      timeout: 30000
    },
    prompt: `
Bu sayfa Türkiye Jokey Kulübü günlük yarış programıdır.

Sadece sayfada gerçekten görünen bugünkü yarış programını çıkar.

Kurallar:
- Uydurma veri üretme.
- Hipodromları meetings altında grupla.
- Her meeting içinde races olsun.
- Her race içinde runners olsun.
- At numarası programdaki gerçek at numarasıdır.
- raceNumber gerçek koşu numarasıdır.
- Saat görünüyorsa HH:mm biçiminde döndür.
- Mesafe sayısal metre olsun.
- Pist türünü "Çim", "Kum" veya "Sentetik" olarak döndür.
- AGF yoksa null.
- HP yoksa null.
- Jokey adı görünmüyorsa null.
- Kilo görünmüyorsa null.
- At adı birebir sayfadaki ad olsun.
`,
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          meetings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                city: { type: "string" },
                races: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      raceNumber: { type: "integer" },
                      time: {
                        anyOf: [
                          { type: "string" },
                          { type: "null" }
                        ]
                      },
                      distanceMeters: {
                        anyOf: [
                          { type: "integer" },
                          { type: "null" }
                        ]
                      },
                      track: {
                        anyOf: [
                          { type: "string" },
                          { type: "null" }
                        ]
                      },
                      runners: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            number: { type: "integer" },
                            name: { type: "string" },
                            jockey: {
                              anyOf: [
                                { type: "string" },
                                { type: "null" }
                              ]
                            },
                            weight: {
                              anyOf: [
                                { type: "number" },
                                { type: "null" }
                              ]
                            },
                            hp: {
                              anyOf: [
                                { type: "integer" },
                                { type: "null" }
                              ]
                            },
                            agfPercent: {
                              anyOf: [
                                { type: "number" },
                                { type: "null" }
                              ]
                            }
                          },
                          required: [
                            "number",
                            "name",
                            "jockey",
                            "weight",
                            "hp",
                            "agfPercent"
                          ]
                        }
                      }
                    },
                    required: [
                      "raceNumber",
                      "time",
                      "distanceMeters",
                      "track",
                      "runners"
                    ]
                  }
                }
              },
              required: ["city", "races"]
            }
          }
        },
        required: ["meetings"]
      }
    }
  });

  const payload = await response.json();

  return json({
    ok: response.ok,
    sourceUrl: source.url,
    discoveredNow: source.discovered,
    data: payload
  }, response.ok ? 200 : 502);
}
