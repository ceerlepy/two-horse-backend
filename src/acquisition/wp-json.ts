import type {
  AcquiredHtml
} from "./types";

/*
 * Some WordPress sites put bot protection (Cloudflare WAF,
 * Turnstile challenge) in front of the human-facing pages but
 * leave the built-in `/wp-json/wp/v2/posts` REST API wide open —
 * confirmed live against bankotahminler.com, whose article pages
 * (and listing pages) return a Cloudflare "Just a moment..."
 * challenge while its wp-json endpoint returns clean 200 JSON for
 * the exact same content.
 *
 * Both acquisition functions below are a last resort: they only
 * help when the target host happens to run WordPress and exposes
 * this endpoint, and degrade to a fast, harmless error/empty
 * result for every other site.
 */

interface WpJsonPost {
  link?:unknown;
  title?:{ rendered?:unknown };
  content?:{ rendered?:unknown };
}

async function fetchWpJsonPosts(
  origin:string,
  query:string,
  timeoutMs:number
):Promise<WpJsonPost[]> {
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
        `${origin}/wp-json/wp/v2/posts?${query}`,
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

    const posts:unknown =
      await response.json();

    return Array.isArray(posts)
      ? posts as WpJsonPost[]
      : [];

  } finally {
    clearTimeout(timer);
  }
}


/*
 * Discovery counterpart to acquireWpJsonHtml: when the site's
 * listing/landing pages are themselves behind the same challenge
 * that blocks individual articles, the wp-json search endpoint can
 * still return candidate article links (confirmed live: ?search=
 * Adana / ?search=İstanbul both return today's real articles as
 * clean JSON while every listing-page fetch is challenged).
 * Returns plain URLs so they flow through the exact same
 * URL-evidence candidate scoring as the cf-links discovery stage —
 * no separate scoring path to maintain.
 */
export async function acquireWpJsonSearchLinks(
  landingUrl:string,
  cities:string[],
  options:{ timeoutMs?:number } = {}
):Promise<{ links:string[] }> {
  const timeoutMs =
    options.timeoutMs ?? 10_000;

  const origin =
    new URL(landingUrl).origin;

  const links =
    new Set<string>();

  for (const city of cities) {
    try {
      const posts =
        await fetchWpJsonPosts(
          origin,
          `search=${encodeURIComponent(city)}&per_page=10&_fields=id,date,link,title`,
          timeoutMs
        );

      for (const post of posts) {
        if (typeof post.link === "string") {
          links.add(post.link);
        }
      }

    } catch {
      continue;
    }
  }

  return {
    links:[...links]
  };
}


/*
 * Looks a single article up by slug (the last path segment of its
 * human-facing URL) and returns its content as if it had been
 * scraped from the page — confirmed live: bankotahminler.com's
 * article pages return a Cloudflare challenge on every other fetch
 * path, but its wp-json endpoint returns the same article's clean
 * HTML content when matched by slug.
 */
export async function acquireWpJsonHtml(
  url:string,
  options:{ timeoutMs?:number } = {}
):Promise<AcquiredHtml> {
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

  const posts =
    await fetchWpJsonPosts(
      parsed.origin,
      `slug=${encodeURIComponent(slug)}&_fields=id,date,link,title,content`,
      timeoutMs
    );

  const post =
    posts[0];

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

  const title =
    String(
      post?.title
        ?.rendered ??
      ""
    );

  const html =
    `<html><body><h1>${title}</h1>${bodyHtml}</body></html>`;

  return {
    stage:
      "wp-json",

    html,

    requestedUrl:
      url,

    finalUrl:
      typeof post.link === "string"
        ? post.link
        : url,

    status:
      200,

    contentType:
      "text/html",

    bodyLength:
      html.length
  };
}
