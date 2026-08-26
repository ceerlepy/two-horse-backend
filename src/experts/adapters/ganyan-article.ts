import {
  load
} from "cheerio";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import {
  acquireCfLinks
} from "../../acquisition/cloudflare-links";

import {
  EXPERT_ACQUISITION_CONFIG
} from "../../config/expert-acquisition";

import {
  acquireExpertHtmlStage
} from "../acquisition-fallback";

import {
  candidateEvidence
} from "../discovery";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import type {
  ExpertAcquireContext,
  ExpertAdapterContext,
  ExpertTargetResolution
} from "./types";


const NEWS =
  "https://www.ganyancanavari.com.tr/haberler/";


function htmlEscape(
  value:
    string
): string {
  return value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}


function normalizeUrl(
  base:
    string,

  value:
    string
): string | null {
  try {
    const url =
      new URL(
        value,
        base
      );


    if (
      url.protocol !==
        "https:" &&
      url.protocol !==
        "http:"
    ) {
      return null;
    }


    if (
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase() !==
      "ganyancanavari.com.tr"
    ) {
      return null;
    }


    url.hash="";


    return url.toString();

  } catch {
    return null;
  }
}


function decodedMaterial(
  value:
    string
): string {
  try {
    const url =
      new URL(
        value
      );


    return decodeURIComponent(
      `${url.pathname} ${url.search}`
    );

  } catch {
    try {
      return decodeURIComponent(
        value
      );

    } catch {
      return value;
    }
  }
}


function isGalopArticle(
  value:
    string
): boolean {
  const material =
    normalizeExpertSearchText(
      decodedMaterial(
        value
      )
    );


  return (
    material.includes(
      "galop incelemesi"
    ) &&
    material.includes(
      "haber detay"
    )
  );
}


function linksFromHtml(
  base:
    string,

  html:
    string
): string[] {
  const $ =
    load(
      html
    );


  const values:
    string[] = [];


  $("a[href]").each(
    (
      _index,
      element
    ) => {
      const href =
        $(
          element
        )
          .attr(
            "href"
          );


      if (!href) {
        return;
      }


      const url =
        normalizeUrl(
          base,
          href
        );


      if (url) {
        values.push(
          url
        );
      }
    }
  );


  return [
    ...new Set(
      values
    )
  ];
}


function bodyTextFromHtml(
  html:
    string
): string {
  const $ =
    load(
      html
    );


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


  return $("body")
    .text()
    .replace(/\u00a0/g," ")
    .replace(/[\t\r ]+/g," ")
    .replace(/\n\s+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}


function targetCandidates(
  context:
    ExpertAdapterContext,

  values:
    string[]
) {
  return values
    .map(
      value =>
        normalizeUrl(
          NEWS,
          value
        )
    )
    .filter(
      (
        value
      ): value is string =>
        Boolean(
          value
        )
    )
    .filter(
      isGalopArticle
    )
    .map(
      url => {
        const material =
          decodedMaterial(
            url
          );


        const evidence =
          candidateEvidence(
            context
              .source
              .source_key,

            url,
            material,
            context.raceDate,
            context.cities,
            material
          );


        return {
          url,
          evidence
        };
      }
    )
    .filter(
      item =>
        item
          .evidence
          .hasDate &&
        item
          .evidence
          .hasCity &&
        item
          .evidence
          .hasPredictionLanguage &&
        !item
          .evidence
          .hasNegativeLanguage
    )
    .sort(
      (
        first,
        second
      ) =>
        second
          .evidence
          .score -
        first
          .evidence
          .score
    );
}


function pickOnePerCity(
  context:
    ExpertAdapterContext,

  candidates:
    ReturnType<
      typeof targetCandidates
    >
) {
  const selected:
    string[] = [];

  const missing:
    string[] = [];


  for (
    const city of
    context.cities
  ) {
    const normalizedCity =
      normalizeExpertSearchText(
        city
      );


    const matches =
      candidates.filter(
        candidate =>
          candidate
            .evidence
            .matchedCities
            .some(
              matched =>
                normalizeExpertSearchText(
                  matched
                ) ===
                normalizedCity
            )
      );


    const winner =
      matches
        .sort(
          (
            first,
            second
          ) => {
            const firstMobile =
              /mobile\.html$/i
                .test(
                  new URL(
                    first.url
                  )
                    .pathname
                )
                ? 1
                : 0;

            const secondMobile =
              /mobile\.html$/i
                .test(
                  new URL(
                    second.url
                  )
                    .pathname
                )
                ? 1
                : 0;


            return (
              firstMobile -
                secondMobile ||
              second
                .evidence
                .score -
              first
                .evidence
                .score
            );
          }
        )[0];


    if (!winner) {
      missing.push(
        city
      );

      continue;
    }


    if (
      !selected.includes(
        winner.url
      )
    ) {
      selected.push(
        winner.url
      );
    }
  }


  return {
    selected,
    missing
  };
}


export async function resolveGanyanGalopArticles(
  context:
    ExpertAdapterContext
): Promise<ExpertTargetResolution> {
  const diagnostics:
    any = {
      attempts:[]
    };


  try {
    const acquired =
      await acquireCfLinks(
        context.env,
        NEWS
      );


    const candidates =
      targetCandidates(
        context,
        acquired.links
      );


    const picked =
      pickOnePerCity(
        context,
        candidates
      );


    diagnostics
      .attempts
      .push({
        stage:
          "cf-links",

        linkCount:
          acquired.links.length,

        candidateCount:
          candidates.length,

        selected:
          picked.selected,

        missingCities:
          picked.missing
      });


    if (
      !picked
        .missing
        .length &&
      picked
        .selected
        .length
    ) {
      return {
        status:
          "ready",

        mode:
          "article",

        targets:
          picked.selected,

        discoveredFromUrl:
          NEWS,

        discoveryMethod:
          "cf-links-galop-article",

        diagnostics
      };
    }

  } catch(error) {
    diagnostics
      .attempts
      .push({
        stage:
          "cf-links",

        error:
          error instanceof Error
            ? error.message
            : String(
                error
              )
      });
  }


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          context.env,
          NEWS,
          stage
        );


      const links =
        linksFromHtml(
          NEWS,
          acquired.html
        );


      const candidates =
        targetCandidates(
          context,
          links
        );


      const picked =
        pickOnePerCity(
          context,
          candidates
        );


      diagnostics
        .attempts
        .push({
          stage,

          bodyLength:
            acquired.bodyLength,

          linkCount:
            links.length,

          candidateCount:
            candidates.length,

          selected:
            picked.selected,

          missingCities:
            picked.missing
        });


      if (
        !picked
          .missing
          .length &&
        picked
          .selected
          .length
      ) {
        return {
          status:
            "ready",

          mode:
            "article",

          targets:
            picked.selected,

          discoveredFromUrl:
            NEWS,

          discoveryMethod:
            `${stage}-galop-article`,

          diagnostics
        };
      }

    } catch(error) {
      diagnostics
        .attempts
        .push({
          stage,

          error:
            error instanceof Error
              ? error.message
              : String(
                  error
                )
        });
    }
  }


  return {
    status:
      "not-published",

    mode:
      "article",

    targets:[],

    discoveredFromUrl:
      NEWS,

    discoveryMethod:
      null,

    diagnostics
  };
}


export function extractGanyanCommentsSection(
  text:
    string,

  city:
    string
): string | null {
  const escapedCity =
    city.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );


  const cityHeading =
    new RegExp(
      `${escapedCity}\\s+En\\s+Son\\s+Yorumlar`,
      "iu"
    );


  const genericHeading =
    /En\s+Son\s+Yorumlar/iu;


  const heading =
    cityHeading.exec(
      text
    ) ??
    genericHeading.exec(
      text
    );


  if (
    !heading ||
    heading.index ===
      undefined
  ) {
    return null;
  }


  const tail =
    text.slice(
      heading.index
    );


  let end =
    tail.length;


  for (
    const marker of
    [
      /Tüm\s+Yorumları\s+Gör/iu,
      /Takı\s+Değişiklikleri/iu,
      /Şehir\s+Değişiklikleri/iu,
      /Günün\s+Jokeyleri/iu
    ]
  ) {
    const match =
      marker.exec(
        tail
      );


    if (
      match &&
      match.index <
        end
    ) {
      end =
        match.index;
    }
  }


  const section =
    tail.slice(
      0,
      end
    )
      .trim();


  const identity =
    /tarafından\s+\d{1,2}\s*\.\s*koşuda\s*\(\s*\d+\s*\)[^\n]{0,160}/iu;


  return identity.test(
    section
  )
    ? section
    : null;
}


function wrapDocument(
  raceDate:
    string,

  city:
    string,

  text:
    string
): string {
  const payload =
    [
      "TWOHORSE SOURCE: GANYAN CANAVARI",
      `TWOHORSE TARGET DATE: ${raceDate}`,
      `TWOHORSE TARGET CITY: ${city}`,
      "",
      text
    ].join(
      "\n"
    );


  return [
    "<html>",
    "<body>",
    "<article>",
    "<pre>",
    htmlEscape(
      payload
    ),
    "</pre>",
    "</article>",
    "</body>",
    "</html>"
  ].join("");
}


function cityForArticle(
  context:
    ExpertAcquireContext
): string | null {
  const material =
    normalizeExpertSearchText(
      decodedMaterial(
        context.url
      )
    );


  const matches =
    context.cities
      .filter(
        city =>
          material.includes(
            normalizeExpertSearchText(
              city
            )
          )
      );


  return matches.length ===
    1
    ? matches[0]
    : context.cities.length ===
        1
      ? context.cities[0]
      : null;
}


export async function acquireGanyanGalopArticle(
  context:
    ExpertAcquireContext
): Promise<AcquiredHtml> {
  const city =
    cityForArticle(
      context
    );


  if (!city) {
    throw new Error(
      "GANYAN_ARTICLE_CITY_AMBIGUOUS"
    );
  }


  const failures:
    any[] = [];


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          context.env,
          context.url,
          stage
        );


      const text =
        bodyTextFromHtml(
          acquired.html
        );


      const section =
        extractGanyanCommentsSection(
          text,
          city
        );


      if (!section) {
        failures.push({
          stage,

          bodyLength:
            acquired.bodyLength,

          textCharacters:
            text.length,

          reason:
            "PUBLIC_COMMENTS_NOT_FOUND"
        });

        continue;
      }


      const html =
        wrapDocument(
          context.raceDate,
          city,
          section
        );


      return {
        stage:
          acquired.stage,

        html,

        requestedUrl:
          context.url,

        finalUrl:
          acquired.finalUrl,

        status:
          acquired.status,

        contentType:
          "text/html",

        bodyLength:
          html.length
      };

    } catch(error) {
      failures.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(
                error
              )
      });
    }
  }


  throw new Error(
    "GANYAN_PUBLIC_COMMENTS_ACQUISITION_FAILED:" +
    JSON.stringify(
      failures
    )
  );
}
