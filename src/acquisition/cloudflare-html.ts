import type {
  Env
} from "../env";

import type {
  AcquiredHtml
} from "./types";

const DEFAULT_TIMEOUT_MS =
  30_000;

function unwrap(
  value: any
): any {
  if (
    value &&
    typeof value === "object" &&
    "result" in value
  ) {
    return value.result;
  }

  return value;
}

function findHtml(
  value: any
): string | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    typeof value.html === "string" &&
    value.html.length > 100
  ) {
    return value.html;
  }

  if (Array.isArray(value)) {
    for (
      const child of value
    ) {
      const found =
        findHtml(child);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (
    typeof value === "object"
  ) {
    for (
      const child of
      Object.values(value)
    ) {
      const found =
        findHtml(child);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

export async function acquireCfScrapeHtml(
  env: Env,
  url: string
): Promise<AcquiredHtml> {
  const response =
    await env.BROWSER.quickAction(
      "scrape",
      {
        url,

        elements: [
          {
            selector:
              "body"
          }
        ],

        gotoOptions: {
          waitUntil:
            "networkidle2",

          timeout:
            DEFAULT_TIMEOUT_MS
        },

        rejectResourceTypes: [
          "image",
          "media",
          "font"
        ]
      } as any
    );

  if (!response.ok) {
    throw new Error(
      `CF_SCRAPE_HTTP_${response.status}`
    );
  }

  const payload =
    unwrap(
      await response.json()
    );

  const bodyHtml =
    findHtml(payload);

  if (!bodyHtml) {
    throw new Error(
      "CF_SCRAPE_HTML_NOT_FOUND"
    );
  }

  const html =
    `<html><body>${bodyHtml}</body></html>`;

  return {
    stage:
      "cf-scrape",

    html,

    requestedUrl:
      url,

    finalUrl:
      null,

    status:
      response.status,

    contentType:
      "text/html",

    bodyLength:
      html.length
  };
}

export async function acquireCfContentHtml(
  env: Env,
  url: string
): Promise<AcquiredHtml> {
  const response =
    await env.BROWSER.quickAction(
      "content",
      {
        url,

        gotoOptions: {
          waitUntil:
            "networkidle2",

          timeout:
            DEFAULT_TIMEOUT_MS
        },

        rejectResourceTypes: [
          "image",
          "media",
          "font"
        ]
      } as any
    );

  if (!response.ok) {
    throw new Error(
      `CF_CONTENT_HTTP_${response.status}`
    );
  }

  const html =
    await response.text();

  if (
    html.length < 500
  ) {
    throw new Error(
      `CF_CONTENT_TOO_SMALL:${html.length}`
    );
  }

  return {
    stage:
      "cf-content",

    html,

    requestedUrl:
      url,

    finalUrl:
      null,

    status:
      response.status,

    contentType:
      "text/html",

    bodyLength:
      html.length
  };
}
