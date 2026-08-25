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


function normalizePathMatchValue(
  value:
    string
): string | null {
  try {
    const raw =
      value.startsWith(
        "http://"
      ) ||
      value.startsWith(
        "https://"
      )
        ? new URL(value)
            .pathname
        : value;


    return decodeURIComponent(
      raw
    )
      .normalize(
        "NFKC"
      )
      .toLowerCase()
      .replace(
        /^\/+|\/+$/g,
        ""
      );

  } catch {
    return null;
  }
}


export function preferredArticlePathScore(
  sourceKey:
    string,

  value:
    string
): number {
  const path =
    normalizePathMatchValue(
      value
    );


  if (!path) {
    return 0;
  }


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
          normalizePathMatchValue(
            rule.value
          );


        if (!candidate) {
          return score;
        }


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
}


function normalizedPath(
  value:
    string
): string | null {
  try {
    const path =
      value.startsWith(
        "http://"
      ) ||
      value.startsWith(
        "https://"
      )
        ? new URL(value)
            .pathname
        : value;


    const normalized =
      (
        path.startsWith("/")
          ? path
          : `/${path}`
      )
        .replace(
          /\/+$/,
          ""
        )
        .toLowerCase();


    return normalized || "/";

  } catch {
    return null;
  }
}


export function isExcludedExpertUtilityPath(
  value:
    string
): boolean {
  const path =
    normalizedPath(
      value
    );


  if (!path) {
    return true;
  }


  return EXPERT_ACQUISITION_CONFIG
    .discovery
    .excludedPathPrefixes
    .some(
      prefix => {
        const normalizedPrefix =
          normalizedPath(
            prefix
          );


        return Boolean(
          normalizedPrefix &&
          (
            path ===
              normalizedPrefix ||
            path.startsWith(
              `${normalizedPrefix}/`
            )
          )
        );
      }
    );
}


function isConfiguredEntryPath(
  sourceKey:
    string,

  value:
    string
): boolean {
  const candidatePath =
    normalizedPath(
      value
    );


  if (!candidatePath) {
    return false;
  }


  return expertSourceConfig(
    sourceKey
  )
    .entryUrls
    .some(
      entryUrl =>
        normalizedPath(
          entryUrl
        ) ===
        candidatePath
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


    if (
      isExcludedExpertUtilityPath(
        path
      )
    ) {
      return false;
    }


    /*
     * A configured entry/listing/current-index page is a
     * discovery surface, never an article target.
     *
     * Generic rule: no source-specific exception required.
     */
    if (
      isConfiguredEntryPath(
        sourceKey,
        value
      )
    ) {
      return false;
    }


    return true;

  } catch {
    return false;
  }
}
