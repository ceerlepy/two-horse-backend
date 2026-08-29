import type {
  AcquiredHtml
} from "./types";

export interface HttpFetchOptions {
  timeoutMs?: number;
  minimumBytes?: number;
  userAgent?: string;
}

export async function acquireHttpHtml(
  url: string,
  options: HttpFetchOptions = {}
): Promise<AcquiredHtml> {
  const timeoutMs =
    options.timeoutMs ?? 12_000;

  const minimumBytes =
    options.minimumBytes ?? 500;

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          redirect:
            "follow",

          headers: {
            "user-agent":
              options.userAgent ??
              "TwoHorse/1.0 (+race-analysis)"
          },

          /*
           * Every fetch here is meant to reflect the source's
           * current state (today's tahmin content) — a
           * same-day-stale Cloudflare edge cache is never
           * correct for this system, so always bypass it and
           * hit the origin fresh.
           */
          cf: {
            cacheTtl: 0,
            cacheEverything: false
          } as any
        }
      );

    const html =
      await response.text();

    if (!response.ok) {
      /*
       * A transport-specific 404 is not automatically proof
       * that a public article does not exist.
       *
       * Keep enough SAFE diagnostics to distinguish:
       * - real origin 404
       * - WAF / synthetic 404
       * - redirect/routing mismatch
       *
       * Never include request secrets/cookies.
       */
      const title =
        (
          /<title[^>]*>([\s\S]*?)<\/title>/i
            .exec(html)?.[1] ??
          ""
        )
          .replace(/<[^>]+>/g," ")
          .replace(/\s+/g," ")
          .trim()
          .slice(0,240);

      const preview =
        html
          .replace(/<script[\s\S]*?<\/script>/gi," ")
          .replace(/<style[\s\S]*?<\/style>/gi," ")
          .replace(/<[^>]+>/g," ")
          .replace(/&nbsp;/gi," ")
          .replace(/\s+/g," ")
          .trim()
          .slice(0,360);

      throw new Error(
        `HTTP_${response.status}:` +
        JSON.stringify({
          finalUrl:
            response.url || url,

          contentType:
            response.headers.get(
              "content-type"
            ),

          server:
            response.headers.get(
              "server"
            ),

          cfRay:
            response.headers.get(
              "cf-ray"
            ),

          bodyLength:
            html.length,

          title,
          preview
        })
      );
    }

    if (
      html.length <
      minimumBytes
    ) {
      throw new Error(
        `HTTP_TOO_SMALL:${html.length}`
      );
    }

    return {
      stage: "http",

      html,

      requestedUrl:
        url,

      finalUrl:
        response.url || url,

      status:
        response.status,

      contentType:
        response.headers.get(
          "content-type"
        ),

      bodyLength:
        html.length
    };
  } finally {
    clearTimeout(timer);
  }
}
