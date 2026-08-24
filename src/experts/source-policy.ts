interface ExpertPublishingPolicy {
  requiresDiscoveredArticle:
    boolean;
}


const DEFAULT_POLICY:
  ExpertPublishingPolicy = {
  requiresDiscoveredArticle:
    false
};


const POLICIES:
  Record<
    string,
    ExpertPublishingPolicy
  > = {
  /*
   * Liderform publishes the current expert analysis as a
   * separate Haberler article.
   *
   * Its homepage, records, program and other utility
   * pages must never substitute for a missing article.
   */
  liderform: {
    requiresDiscoveredArticle:
      true
  }
};


export function expertRequiresDiscoveredArticle(
  sourceKey:
    string
): boolean {
  return (
    POLICIES[
      sourceKey
    ] ??
    DEFAULT_POLICY
  )
    .requiresDiscoveredArticle;
}


/*
 * Source-aware hard fence AFTER semantic discovery.
 *
 * Discovery AI still decides which current article is
 * relevant, but it cannot promote a URL outside the
 * source's known editorial URL family.
 *
 * Verified Liderform article contract:
 *
 * /haberler/<article>.html
 *
 * Category/index pages such as:
 *
 * /haberler/analizler
 *
 * are intentionally not accepted as article URLs.
 */
export function isAllowedDiscoveredArticleUrl(
  sourceKey:
    string,

  value:
    string
): boolean {
  if (
    sourceKey !==
    "liderform"
  ) {
    return true;
  }


  try {
    const url =
      new URL(
        value
      );


    const host =
      url.hostname
        .replace(
          /^www\./,
          ""
        )
        .toLowerCase();


    const path =
      url.pathname
        .toLowerCase();


    return (
      host ===
        "liderform.com.tr" &&
      path.startsWith(
        "/haberler/"
      ) &&
      path.endsWith(
        ".html"
      )
    );

  } catch {
    return false;
  }
}
