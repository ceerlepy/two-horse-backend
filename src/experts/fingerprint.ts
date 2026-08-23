import {
  load
} from "cheerio";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  sha256
} from "../shared";


export interface ExpertFingerprint {
  hash:
    string;

  bodyLength:
    number;
}


export interface ExpertFingerprintOptions {
  /*
   * Daily article:
   * false
   *
   * Stable landing/current page:
   * true
   *
   * Landing href destinations matter because today's
   * article may be published under a new URL while the
   * visible anchor text remains similar.
   */
  includeLinks?:
    boolean;
}


function normalizedVisibleText(
  html:
    string
): {
  text:
    string;

  rootHtml:
    string;
} {
  const $ =
    load(html);


  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "iframe"
    ].join(",")
  ).remove();


  const root =
    $("body").length
      ? $("body")
      : $.root();


  return {
    text:
      root
        .text()
        .replace(
          /\s+/g,
          " "
        )
        .trim(),

    rootHtml:
      root.html() ??
      ""
  };
}


export function normalizeExpertFingerprintMaterial(
  html:
    string,

  baseUrl:
    string,

  includeLinks =
    false
): string {
  const $ =
    load(html);


  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "iframe"
    ].join(",")
  ).remove();


  const root =
    $("body").length
      ? $("body")
      : $.root();


  const text =
    root
      .text()
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  if (!includeLinks) {
    return text;
  }


  const links =
    root
      .find(
        "a[href]"
      )
      .map(
        (
          _index,
          element
        ) => {
          const href =
            $(element)
              .attr(
                "href"
              );


          if (!href) {
            return null;
          }


          try {
            const url =
              new URL(
                href,
                baseUrl
              );


            if (
              url.protocol !== "http:" &&
              url.protocol !== "https:"
            ) {
              return null;
            }


            url.hash = "";


            const anchorText =
              $(element)
                .text()
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();


            return (
              anchorText +
              "=>" +
              url.toString()
            );

          } catch {
            return null;
          }
        }
      )
      .get()
      .filter(
        (
          value
        ): value is string =>
          typeof value === "string"
          && value.length > 0
      )
      .join("\n");


  return [
    text,
    links
  ]
    .filter(
      value =>
        value.length > 0
    )
    .join(
      "\n---LINKS---\n"
    );
}


/*
 * Cheap optimization only:
 *
 * HTTP
 * -> normalized material
 * -> SHA-256
 *
 * Browser Run = 0
 * Workers AI = 0
 *
 * Failure never blocks correctness.
 */
export async function expertHttpFingerprint(
  url:
    string,

  options:
    ExpertFingerprintOptions = {}
): Promise<ExpertFingerprint | null> {
  try {
    const acquired =
      await acquireHttpHtml(
        url,
        {
          timeoutMs:
            12_000,

          minimumBytes:
            1000,

          userAgent:
            "TwoHorse/1.0 (+expert-change-detection)"
        }
      );


    const material =
      normalizeExpertFingerprintMaterial(
        acquired.html,
        url,
        options.includeLinks === true
      );


    if (
      material.length <
      250
    ) {
      return null;
    }


    return {
      hash:
        await sha256(
          material
        ),

      bodyLength:
        material.length
    };

  } catch {
    return null;
  }
}
