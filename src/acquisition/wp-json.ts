import type {
  AcquiredHtml
} from "./types";

/*
 * Discovery counterpart to acquireWpJsonHtml: when the site's
 * listing/landing pages are themselves behind the same challenge
 * that blocks individual articles, the wp-json search endpoint can
 * still return candidate article links (confirmed live against
 * bankotahminler.com: ?search=Adana / ?search=İstanbul both return
 * today's real articles as clean JSON while every listing page
 * fetch is challenged). Returns plain URLs so they flow through
 * the exact same URL-evidence candidate scoring as the cf-links
 * discovery stage — no separate scoring path to maintain.
 */
export async function acquireWpJsonSearchLinks(
  landingUrl: string,
  cities: string[],
  options: { timeoutMs?: number } = {}
): Promise<{ links: string[] }> {
  const timeoutMs =
    options.timeoutMs ?? 10_000;

  const origin =
    new URL(landingUrl).origin;

  const links =
    new Set<string>();

  for (const city of cities) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () => controller.abort(),
        timeoutMs
      );

    try {
      const apiUrl =
        `${origin}/wp-json/wp/v2/posts` +
        `?search=${encodeURIComponent(city)}` +
        `&per_page=10&_fields=id,date,link,title`;

      const response =
        await fetch(
          apiUrl,
          {
            signal:
              controller.signal,

            headers: {
              "user-agent":
                "TwoHorse/1.0 (+expert-acquisition)",

              accept:
                "application/json"
            }
          }
        );

      if (!response.ok) {
        continue;
      }

      const contentType =
        response.headers.get(
          "content-type"
        ) ??
        "";

      if (
        !contentType.includes(
          "application/json"
        )
      ) {
        continue;
      }

      const posts:any =
        await response.json();

      if (!Array.isArray(posts)) {
        continue;
      }

      for (const post of posts) {
        if (typeof post?.link === "string") {
          links.add(post.link);
        }
      }

    } catch {
      continue;

    } finally {
      clearTimeout(timer);
    }
  }

  return {
    links:[...links]
  };
}

/*
 * Some WordPress sites put bot protection (Cloudflare WAF,
 * Turnstile challenge) in front of the human-facing pages but
 * leave the built-in `/wp-json/wp/v2/posts` REST API wide open —
 * confirmed live against bankotahminler.com, whose article pages
 * return a Cloudflare "Just a moment..." challenge while its
 * wp-json endpoint returns clean 200 JSON for the exact same
 * article (matched by slug).
 *
 * This is a last-resort fallback stage: it only helps when the
 * target URL's slug happens to also be a WordPress post slug on
 * that same host, and degrades to a fast, harmless 404/error for
 * every site that either isn't WordPress or doesn't expose this
 * endpoint.
 */
export async function acquireWpJsonHtml(
  url: string,
  options: { timeoutMs?: number } = {}
): Promise<AcquiredHtml> {
  const timeoutMs =
    options.timeoutMs ?? 10_000;

  const parsed =
    new URL(url);

  const slug =
    parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop();

  if (!slug) {
    throw new Error(
      "WP_JSON_NO_SLUG"
    );
  }

  const apiUrl =
    `${parsed.origin}/wp-json/wp/v2/posts` +
    `?slug=${encodeURIComponent(slug)}` +
    `&_fields=id,date,link,title,content`;

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
        apiUrl,
        {
          signal:
            controller.signal,

          headers: {
            "user-agent":
              "TwoHorse/1.0 (+expert-acquisition)",

            accept:
              "application/json"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `WP_JSON_HTTP_${response.status}`
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) ??
      "";

    if (
      !contentType.includes(
        "application/json"
      )
    ) {
      throw new Error(
        `WP_JSON_NOT_JSON:${contentType}`
      );
    }

    const posts:any =
      await response.json();

    const post =
      Array.isArray(posts)
        ? posts[0]
        : null;

    const bodyHtml =
      typeof post
        ?.content
        ?.rendered ===
        "string"
        ? post.content.rendered
        : null;

    if (!bodyHtml) {
      throw new Error(
        "WP_JSON_POST_NOT_FOUND"
      );
    }

    const html =
      `<html><body><h1>${
        String(
          post?.title
            ?.rendered ??
          ""
        )
      }</h1>${bodyHtml}</body></html>`;

    return {
      stage:
        "wp-json",

      html,

      requestedUrl:
        url,

      finalUrl:
        typeof post.link ===
          "string"
          ? post.link
          : url,

      status:
        response.status,

      contentType:
        "text/html",

      bodyLength:
        html.length
    };

  } finally {
    clearTimeout(timer);
  }
}
