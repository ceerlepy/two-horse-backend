import type {
  AcquiredHtml
} from "./types";

export interface HttpFetchOptions {
  timeoutMs?: number;
  minimumBytes?: number;
  userAgent?: string;
}

/*
 * TJK answers its dynamic pages (AtKosuBilgileri, AtPerformans,
 * Karsilastirma, idmanpistiDetay) only after a ~50 s stall when the
 * user-agent is not browser-like; the same request with a browser UA
 * returns in under a second (measured 2026-10-04, cold cache both
 * ways). Every TJK caller with a short timeout was therefore timing
 * out and falling back to Browser Rendering.
 */
export const TJK_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0 Safari/537.36";

export function defaultUserAgentFor(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "tjk.org" || host.endsWith(".tjk.org")) {
      return TJK_BROWSER_USER_AGENT;
    }
  } catch {
    // fall through to the project UA
  }
  return "TwoHorse/1.0 (+race-analysis)";
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
              defaultUserAgentFor(url)
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
