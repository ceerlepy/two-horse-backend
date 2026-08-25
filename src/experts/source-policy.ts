import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../config/expert-acquisition";


function normalizedHost(
  value:
    URL
): string {
  return value.hostname
    .replace(/^www\./,"")
    .toLowerCase();
}


export function expertRequiresDiscoveredArticle(
  sourceKey:
    string
): boolean {
  return (
    expertSourceConfig(
      sourceKey
    )
      .mode ===
    "article"
  );
}


export function expertUsesDirectCurrentPage(
  sourceKey:
    string
): boolean {
  return (
    expertSourceConfig(
      sourceKey
    )
      .mode ===
    "direct-current-page"
  );
}


export function expertRootIsEditorial(
  sourceKey:
    string
): boolean {
  return expertSourceConfig(
    sourceKey
  )
    .rootIsEditorial;
}


export function expertNavigationLabels(
  sourceKey:
    string
): string[] {
  return [
    ...expertSourceConfig(
      sourceKey
    )
      .navigationLabels
  ];
}


export function expertPreflightRequiresCity(
  sourceKey:
    string
): boolean {
  return expertSourceConfig(
    sourceKey
  )
    .preflightRequiresCity;
}


export function preferredArticlePathScore(
  sourceKey:
    string,

  value:
    string
): number {
  try {
    const path =
      new URL(value)
        .pathname
        .toLowerCase();


    return expertSourceConfig(
      sourceKey
    )
      .preferredPathRules
      .reduce(
        (
          score,
          rule
        ) => {
          const candidate =
            rule.value
              .toLowerCase();


          const matches =
            rule.kind ===
              "prefix"
              ? path.startsWith(
                  candidate
                )

              : rule.kind ===
                  "suffix"
                ? path.endsWith(
                    candidate
                  )

                : path.includes(
                    candidate
                  );


          return score +
            (
              matches
                ? rule.score
                : 0
            );
        },
        0
      );

  } catch {
    return 0;
  }
}


function excludedUtilityPath(
  path:
    string
): boolean {
  return EXPERT_ACQUISITION_CONFIG
    .discovery
    .excludedPathPrefixes
    .some(
      prefix =>
        path === prefix ||
        path.startsWith(
          `${prefix}/`
        )
    );
}


/*
 * Hard fence:
 *
 * - correct configured source host
 * - HTTP(S)
 * - not root itself
 * - not a configured utility path
 *
 * Article prefixes are NOT hard truth.
 */
export function isAllowedDiscoveredArticleUrl(
  sourceKey:
    string,

  value:
    string
): boolean {
  try {
    const source =
      expertSourceConfig(
        sourceKey
      );


    const url =
      new URL(value);


    if (
      normalizedHost(url) !==
      source.host
        .replace(/^www\./,"")
        .toLowerCase()
    ) {
      return false;
    }


    if (
      url.protocol !==
        "https:" &&
      url.protocol !==
        "http:"
    ) {
      return false;
    }


    const path =
      url.pathname
        .toLowerCase();


    if (
      path === "/" &&
      !url.search
    ) {
      return false;
    }


    return !excludedUtilityPath(
      path
    );

  } catch {
    return false;
  }
}
