import puppeteer
  from "@cloudflare/puppeteer";

import {
  load
} from "cheerio";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import {
  acquireHttpHtml
} from "../../acquisition/http";

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


  /*
   * HorsAI order:
   * ordinary HTTP listing first.
   */
  try {
    const acquired =
      await acquireHttpHtml(
        NEWS,
        {
          timeoutMs:5_000,
          minimumBytes:200,

          userAgent:
            "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
        }
      );

    const links =
      linksFromHtml(
        acquired.finalUrl ||
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
        stage:
          "http",

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
        status:"ready",
        mode:"article",

        targets:
          picked.selected,

        discoveredFromUrl:
          NEWS,

        discoveryMethod:
          "http-galop-article",

        diagnostics
      };
    }

  } catch(error) {
    diagnostics
      .attempts
      .push({
        stage:"http",

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
  }


  /*
   * Link extraction fallback only if ordinary HTTP
   * did not expose exact dated city hrefs.
   */
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


  /*
   * Never accept another city's generic comments block.
   */
  const heading =
    cityHeading.exec(
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
      "GANYAN_GALOP_CITY_AMBIGUOUS"
    );
  }

  const failures:any[] =
    [];


  function variants(
    value:string
  ):string[] {
    try {
      const original =
        new URL(value);

      const values =
        [
          original.toString()
        ];

      if (
        /Mobile\.html$/i
          .test(
            original.pathname
          )
      ) {
        const standard =
          new URL(
            original.toString()
          );

        standard.pathname =
          standard.pathname
            .replace(
              /Mobile\.html$/i,
              ".html"
            );

        values.unshift(
          standard.toString()
        );

      } else if (
        /\.html$/i
          .test(
            original.pathname
          )
      ) {
        const mobile =
          new URL(
            original.toString()
          );

        mobile.pathname =
          mobile.pathname
            .replace(
              /\.html$/i,
              "Mobile.html"
            );

        values.push(
          mobile.toString()
        );
      }

      return [
        ...new Set(values)
      ];

    } catch {
      return [value];
    }
  }


  function accepted(
    acquired:
      AcquiredHtml,

    requestedVariant:
      string
  ):AcquiredHtml|null {
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
        stage:
          acquired.stage,

        variant:
          requestedVariant,

        bodyLength:
          acquired.bodyLength,

        textCharacters:
          text.length,

        reason:
          "EXACT_CITY_COMMENTS_NOT_FOUND"
      });

      return null;
    }

    const html =
      wrapDocument(
        context.raceDate,
        city,
        section
      );

    return {
      ...acquired,

      html,

      requestedUrl:
        context.url,

      bodyLength:
        html.length,

      contentType:
        "text/html"
    };
  }


  const urls =
    variants(
      context.url
    );


  /*
   * 1. Ordinary HTTP on the exact article URL.
   *
   * If public comments are present:
   * STOP. No Quick Action, no browser.
   */
  for (
    const url of
    urls
  ) {
    try {
      const acquired =
        await acquireHttpHtml(
          url,
          {
            timeoutMs:6_000,
            minimumBytes:200,

            userAgent:
              "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
          }
        );

      const result =
        accepted(
          acquired,
          url
        );

      if (result) {
        return result;
      }

    } catch(error) {
      failures.push({
        stage:"http",
        variant:url,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  /*
   * 2. Targeted Cloudflare Quick Action fallback.
   *
   * Same exact article variants only.
   */
  for (
    const url of
    urls
  ) {
    for (
      const stage of
      EXPERT_ACQUISITION_CONFIG
        .extraction
        .acquisitionOrder
        .filter(
          value =>
            value !==
              "http"
        )
    ) {
      try {
        const acquired =
          await acquireExpertHtmlStage(
            context.env,
            url,
            stage
          );

        const result =
          accepted(
            acquired,
            url
          );

        if (result) {
          return result;
        }

      } catch(error) {
        failures.push({
          stage,
          variant:url,

          error:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }
    }
  }


  /*
   * 3. LAST rescue:
   * one real browser session, exact article variants only.
   *
   * Main Galop article may require login, but the
   * "CITY En Son Yorumlar" block is publicly rendered.
   */
  let browser:any =
    null;

  try {
    browser =
      await puppeteer.launch(
        context.env.BROWSER as any
      );

    const page:any =
      await browser.newPage();

    for (
      const url of
      urls
    ) {
      try {
        await page.goto(
          url,
          {
            waitUntil:
              "domcontentloaded",

            timeout:
              10_000
          }
        );

        await page.waitForSelector(
          "body",
          {
            timeout:
              4_000
          }
        );

        const text =
          String(
            await page.evaluate(
              () =>
                document.body
                  ?.innerText ??
                ""
            )
          );

        const section =
          extractGanyanCommentsSection(
            text,
            city
          );

        if (!section) {
          failures.push({
            stage:
              "browser-session",

            variant:
              url,

            textCharacters:
              text.length,

            reason:
              "EXACT_CITY_COMMENTS_NOT_FOUND"
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
            "browser-session",

          html,

          requestedUrl:
            context.url,

          finalUrl:
            String(
              page.url()
            ),

          status:200,

          contentType:
            "text/html",

          bodyLength:
            html.length,

          diagnostics:{
            traceVersion:
              "ganyan-public-comments-v2",

            city,

            selectedVariant:
              url,

            failures
          }
        };

      } catch(error) {
        failures.push({
          stage:
            "browser-session",

          variant:url,

          error:
            error instanceof Error
              ? error.message
              : String(error)
        });
      }
    }

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // non-fatal
      }
    }
  }


  throw new Error(
    "GANYAN_PUBLIC_COMMENTS_ACQUISITION_FAILED:" +
    JSON.stringify(
      failures
    )
  );
}
