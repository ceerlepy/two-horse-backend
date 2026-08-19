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
          }
        }
      );

    const html =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status}`
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
