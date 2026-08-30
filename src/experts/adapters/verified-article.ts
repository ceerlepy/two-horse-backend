import puppeteer
  from "@cloudflare/puppeteer";

import type {
  Env
} from "../../env";

import {
  load
} from "cheerio";

import {
  acquireCfContentHtml,
  acquireCfScrapeHtml
} from "../../acquisition/cloudflare-html";

import {
  acquireCfLinks
} from "../../acquisition/cloudflare-links";

import {
  acquireHttpHtml
} from "../../acquisition/http";

import {
  acquireWpJsonHtml,
  acquireWpJsonSearchLinks
} from "../../acquisition/wp-json";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../../config/expert-acquisition";

import {
  expertArticleTextFromHtml
} from "../article-text";

import {
  candidateEvidence
} from "../discovery";

import {
  cleanExpertInlineText,
  normalizeExpertSearchText
} from "../text-normalization";

import {
  selectExpertCandidateUrlsWithWorkersAi
} from "../workers-ai-discovery";

import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAcquireContext,
  ExpertAdapter,
  ExpertAdapterContext,
  ExpertTargetResolution
} from "./types";


type ListingStage =
  | "http"
  | "cf-content"
  | "cf-links"
  | "cf-scrape"
  | "puppeteer"
  | "wp-json";


type ArticleStage =
  | "http"
  | "cf-content"
  | "cf-scrape"
  | "puppeteer"
  | "wp-json";


interface RawLink {
  url:string;
  text:string;
}


interface LooseCandidate {
  url:string;
  text:string;
  score:number;

  matchedCities:
    string[];

  dateEvidence:
    boolean;

  topicEvidence:
    boolean;

  fromUrl:
    string;

  discoveryStage:
    string;
}


interface VerifiedCandidate
  extends LooseCandidate {
  verificationStage:
    string;

  status:
    | "verified"
    | "access-restricted";

  articleText:
    string;
}


export interface DirectArticleCandidate {
  url:string;
  city:string;
}


export interface VerifiedArticlePlan {
  sourceKey:string;
  sourceName:string;

  ownsArticle:
    (
      url:string
    )=>boolean;

  directCandidates?:
    (
      context:
        ExpertAdapterContext
    )=>DirectArticleCandidate[];

  discoveryUrls:
    (
      context:
        ExpertAdapterContext
    )=>string[];

  negativeTerms?:
    string[];

  maxCandidates?:
    number;

  maxVerifiedPerCity?:
    number;

  /*
   * Some human-editorial sources legitimately publish
   * only a subset of today's canonical meetings.
   */
  allowPartialCoverage?:
    boolean;

  /*
   * Source identity must carry target date BEFORE
   * the article body is fetched.
   *
   * Prevents a stale 25-Aug article from becoming
   * a 27-Aug candidate because its sidebar mentions
   * today's date.
   */
  requireCandidateDateEvidence?:
    boolean;

  /*
   * Some WordPress listing pages keep publication date
   * next to the title rather than inside the <a> itself.
   * Opt-in only; avoids page-global stale-date poisoning.
   */
  listingCardContext?:
    boolean;

  allowPuppeteerDiscovery?:
    boolean;

  allowPuppeteerArticle?:
    boolean;

  /*
   * Discovery ownership and extraction ownership are
   * intentionally separate.
   *
   * Default false:
   *   shared verified discovery
   *   + normal static extraction pipeline.
   *
   * True:
   *   adapter also owns article acquisition.
   */
  adapterOwnedExtraction?:
    boolean;

  /*
   * Optional source-specific BODY cleanup.
   *
   * It runs while still inside the exact-URL
   * acquisition ladder.
   *
   * If it rejects the body, acquisition continues
   * to the next transport for the SAME exact URL.
   */
  prepareArticleHtml?:
    (
      context:
        ExpertAcquireContext,

      acquired:
        AcquiredHtml
    )=>AcquiredHtml | Promise<AcquiredHtml>;

  browserNavigationBudget?:
    number;

  fallback?:
    | "legacy"
    | "feed"
    | "none";
}


const MONTHS = [
  "ocak",
  "subat",
  "mart",
  "nisan",
  "mayis",
  "haziran",
  "temmuz",
  "agustos",
  "eylul",
  "ekim",
  "kasim",
  "aralik"
];


const TOPIC_TERMS = [
  "tahmin",
  "analiz",
  "banko",
  "favori",
  "altili",
  "ganyan",
  "rakip",
  "surpriz",
  "yorum",
  "kosu",
  "yaris",
  "galop"
];


function errorMessage(
  value:unknown
):string {
  return value instanceof Error
    ? value.message
    : String(value);
}


function unique(
  values:string[]
):string[] {
  return [
    ...new Set(
      values
        .filter(Boolean)
    )
  ];
}


function normalizeUrl(
  base:string,
  value:string
):string|null {
  try {
    const url =
      new URL(
        value,
        base
      );

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    url.hash="";

    return url.toString();

  } catch {
    return null;
  }
}


function decodedUrl(
  value:string
):string {
  try {
    const url =
      new URL(value);

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


function linksFromHtml(
  baseUrl:string,
  html:string,
  includeCardContext=false
):RawLink[] {
  const $ =
    load(html);

  $(
    "script,style,noscript,svg,canvas,iframe"
  ).remove();

  const result =
    new Map<
      string,
      RawLink
    >();

  $("a[href]").each(
    (
      _index,
      element
    ) => {
      const anchor =
        $(element);

      const href =
        anchor.attr(
          "href"
        );

      if (!href)
        return;

      const url =
        normalizeUrl(
          baseUrl,
          href
        );

      if (!url)
        return;

      const anchorText =
        [
          anchor.text(),
          anchor.attr(
            "title"
          ) ?? "",
          anchor.attr(
            "aria-label"
          ) ?? ""
        ]
          .filter(Boolean)
          .join(" ");

      /*
       * Still LOCAL evidence.
       *
       * For Yaris Dergisi the publication date sits in the
       * same post/card but outside the anchor. We only inspect
       * the nearest editorial container, never whole page.
       */
      const cardText =
        includeCardContext
          ? anchor
              .closest(
                [
                  "article",
                  ".post",
                  ".entry",
                  ".card",
                  ".item",
                  "li"
                ].join(",")
              )
              .first()
              .text()
          : "";

      const text =
        cleanExpertInlineText(
          [
            anchorText,
            cardText
          ]
            .filter(Boolean)
            .join(" "),
          1600
        );

      const old =
        result.get(url);

      if (
        !old ||
        text.length >
          old.text.length
      ) {
        result.set(
          url,
          {
            url,
            text
          }
        );
      }
    }
  );

  return [
    ...result.values()
  ];
}


function articleHeading(
  html:string
):string {
  const $ =
    load(html);

  return cleanExpertInlineText(
    $("h1")
      .first()
      .text(),
    1400
  );
}


function missingPageHtml(
  html:string
):boolean {
  const $ =
    load(html);

  const material =
    normalizeExpertSearchText(
      [
        $("title")
          .first()
          .text(),

        $("h1")
          .first()
          .text(),

        $("body")
          .text()
          .slice(
            0,
            1800
          )
      ].join(" ")
    );

  return [
    "sayfa bulunamadi",
    "page not found",
    "404 not found",
    "404 error"
  ].some(
    term =>
      material.includes(
        term
      )
  );
}


/*
 * A soft-404: the origin returns "Sayfa bulunamadı" for a guessed
 * URL, but a proxy stage (cf-content in particular) can still
 * return HTTP 200 with that error page's body — and that body's
 * own "recent posts" sidebar often lists unrelated real articles
 * whose titles happen to carry a target city/date/prediction word,
 * which is enough to fool the generic evidence heuristics below
 * into accepting it. Detect the page itself as absent regardless
 * of what its surrounding chrome mentions.
 */
const GENERIC_NOT_FOUND_TERMS = [
  "sayfa bulunamadi",
  "aradiginiz sayfa bulunamadi",
  "aradiginiz sey bulunamadi",
  "404 not found",
  "page not found"
];


function restrictionState(
  sourceKey:string,
  text:string
) {
  const source =
    expertSourceConfig(
      sourceKey
    );

  const normalized =
    normalizeExpertSearchText(
      text
    );

  const notFoundHit =
    GENERIC_NOT_FOUND_TERMS
      .find(
        term =>
          normalized.includes(
            normalizeExpertSearchText(
              term
            )
          )
      ) ??
    null;

  const hits =
    (
      source
        .accessDeniedTerms ??
      []
    )
      .filter(
        term =>
          normalized.includes(
            normalizeExpertSearchText(
              term
            )
          )
      );

  const weakVipTerm =
    hits.find(
      term =>
        normalizeExpertSearchText(
          term
        ) ===
        "vip uye ol"
    ) ??
    null;

  const strongTerm =
    hits.find(
      term =>
        normalizeExpertSearchText(
          term
        ) !==
        "vip uye ol"
    ) ??
    null;

  /*
   * A site-wide "VIP üye ol" CTA alone is not proof
   * that the article itself is blocked.
   *
   * If real selection language is present, let the
   * extraction pipeline inspect it.
   */
  const selectionHits =
    [
      "1 ayak",
      "2 ayak",
      "banko",
      "tek",
      "favori",
      "rakip",
      "surpriz"
    ]
      .filter(
        term =>
          normalized.includes(
            term
          )
      )
      .length;

  const substantive =
    text.length >= 800 &&
    selectionHits >= 2;

  return {
    restricted:
      Boolean(
        notFoundHit ||
        strongTerm ||
        (
          weakVipTerm &&
          !substantive
        )
      ),

    strongTerm,
    weakVipTerm,
    substantive,
    hits,
    notFoundHit
  };
}


function articleUsable(
  sourceKey:string,
  html:string
) {
  const article =
    expertArticleTextFromHtml(
      html
    );

  const restriction =
    restrictionState(
      sourceKey,
      article.text
    );

  const normalized =
    normalizeExpertSearchText(
      article.text
    );

  const racing =
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .relevanceTerms
      .some(
        term =>
          normalized.includes(
            normalizeExpertSearchText(
              term
            )
          )
      );

  const missingPage =
    missingPageHtml(
      html
    );

  return {
    article,
    restriction,
    missingPage,

    usable:
      !missingPage &&
      article.outputCharacters >=
        180 &&
      racing &&
      !restriction.restricted
  };
}


const MOBILE_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36";


/*
 * The non-interactive article stages (everything but puppeteer,
 * which needs a live page/browser handle) are identical wherever
 * this file fetches a single known article URL — used by the
 * http-first fetch below, and again inside verify()'s per-candidate
 * loop. One shared dispatcher keeps that in one place instead of
 * three copies drifting apart.
 */
async function acquireArticleStageHtml(
  env:
    Env,

  url:
    string,

  stage:
    Exclude<ArticleStage,"puppeteer">
):Promise<AcquiredHtml> {
  if (
    stage ===
    "http"
  ) {
    return acquireHttpHtml(
      url,
      {
        timeoutMs:
          6_000,

        minimumBytes:
          200,

        userAgent:
          MOBILE_USER_AGENT
      }
    );
  }


  if (
    stage ===
    "cf-content"
  ) {
    return acquireCfContentHtml(
      env,
      url
    );
  }


  if (
    stage ===
    "cf-scrape"
  ) {
    return acquireCfScrapeHtml(
      env,
      url
    );
  }


  return acquireWpJsonHtml(
    url
  );
}


export async function acquireHttpFirstArticleHtml(
  context:
    ExpertAcquireContext,

  options:{
    allowPuppeteer?:
      boolean;

    prepareAcquired?:
      (
        acquired:
          AcquiredHtml
      )=>AcquiredHtml | Promise<AcquiredHtml>;
  } = {}
):Promise<AcquiredHtml> {
  const failures:any[] =
    [];

  let firstRestricted:
    AcquiredHtml |
    null =
    null;

  let browser:any =
    null;

  try {
    const stages:
      ArticleStage[] = [
        "http",
        "cf-content",
        "cf-scrape",
        ...(
          options
            .allowPuppeteer
            ? [
                "puppeteer" as const
              ]
            : []
        ),

        "wp-json"
      ];

    for (
      const stage of
      stages
    ) {
      try {
        let acquired:
          AcquiredHtml;

        if (
          stage !==
          "puppeteer"
        ) {
          acquired =
            await acquireArticleStageHtml(
              context.env,
              context.url,
              stage
            );

        } else {
          browser =
            await puppeteer.launch(
              context.env.BROWSER as any
            );

          const page =
            await browser.newPage();

          await page.goto(
            context.url,
            {
              waitUntil:
                "domcontentloaded",

              timeout:
                8_000
            }
          );

          await page.waitForSelector(
            "body",
            {
              timeout:
                4_000
            }
          );

          for (
            let attempt=0;
            attempt<24;
            attempt++
          ) {
            const state =
              await page.evaluate(
                () => ({
                  title:
                    document.title ??
                    "",

                  text:
                    document.body
                      ?.innerText ??
                    ""
                })
              );

            const material =
              normalizeExpertSearchText(
                [
                  state.title,
                  state.text
                ].join(" ")
              );

            const challenge =
              material.includes(
                "just a moment"
              ) ||
              material.includes(
                "enable javascript and cookies to continue"
              );

            if (
              !challenge &&
              state.text.length >=
                300
            ) {
              break;
            }

            await new Promise<void>(
              resolve =>
                setTimeout(
                  resolve,
                  250
                )
            );
          }

          const html =
            String(
              await page.content()
            );

          acquired = {
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
              html.length
          };
        }

        const quality =
          articleUsable(
            context.sourceKey,
            acquired.html
          );

        failures.push({
          stage,

          bodyLength:
            acquired.bodyLength,

          articleCharacters:
            quality
              .article
              .outputCharacters,

          restricted:
            quality
              .restriction
              .restricted,

          restriction:
            quality
              .restriction
              .hits,

          usable:
            quality.usable
        });

        if (
          quality
            .restriction
            .restricted
        ) {
          firstRestricted ??=
            acquired;

          continue;
        }

        if (
          quality.usable
        ) {
          /*
           * Source-specific preparation is deliberately
           * inside this try block.
           *
           * If the fetched HTML is a shell/wrong body,
           * preparation throws and the SAME exact URL
           * proceeds to the next acquisition stage.
           */
          const selected =
            options.prepareAcquired
              ? await options
                  .prepareAcquired(
                    acquired
                  )
              : acquired;

          return {
            ...selected,

            diagnostics:{
              ...(
                (
                  selected as
                    AcquiredHtml & {
                      diagnostics?:
                        Record<
                          string,
                          unknown
                        >;
                    }
                )
                  .diagnostics ??
                {}
              ),
              traceVersion:
                "http-first-article-v1",

              selectedStage:
                stage,

              attempts:
                failures
            }
          } as
            AcquiredHtml & {
              diagnostics:any;
            };
        }

      } catch(error) {
        failures.push({
          stage,

          error:
            errorMessage(
              error
            )
        });

        /*
         * One transport's 404/410 is not source-level proof.
         * Continue to the next acquisition transport.
         */

      } finally {
        if (
          stage ===
            "puppeteer" &&
          browser
        ) {
          try {
            await browser.close();
          } catch {
            // non-fatal
          }

          browser=null;
        }
      }
    }

    /*
     * Preserve real restricted content so extractor/preflight
     * can classify access-restricted instead of "unavailable".
     */
    if (firstRestricted) {
      return {
        ...firstRestricted,

        diagnostics:{
          traceVersion:
            "http-first-article-v1",

          selectedStage:
            "restricted",

          attempts:
            failures
        }
      } as
        AcquiredHtml & {
          diagnostics:any;
        };
    }

    throw new Error(
      "HTTP_FIRST_ARTICLE_ACQUISITION_FAILED:" +
      JSON.stringify(
        failures
      )
    );

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // non-fatal
      }
    }
  }
}


function looseCandidate(
  context:
    ExpertAdapterContext,

  plan:
    VerifiedArticlePlan,

  fromUrl:
    string,

  discoveryStage:
    string,

  link:
    RawLink
):LooseCandidate|null {
  if (
    !plan.ownsArticle(
      link.url
    )
  ) {
    return null;
  }

  const material =
    normalizeExpertSearchText(
      [
        link.text,
        decodedUrl(
          link.url
        )
      ].join(" ")
    );

  const localNegative =
    (
      plan
        .negativeTerms ??
      []
    )
      .some(
        term =>
          material.includes(
            normalizeExpertSearchText(
              term
            )
          )
      );

  if (localNegative)
    return null;

  const evidence =
    candidateEvidence(
      context
        .source
        .source_key,

      link.url,
      link.text,
      context.raceDate,
      context.cities,

      /*
       * Hard negatives stay link/title local.
       */
      link.text
    );

  if (
    evidence
      .hasNegativeLanguage
  ) {
    return null;
  }

  const matchedCities =
    context.cities
      .filter(
        city =>
          material.includes(
            normalizeExpertSearchText(
              city
            )
          )
      );

  if (
    !matchedCities.length
  ) {
    return null;
  }

  const [
    yearRaw,
    monthRaw,
    dayRaw
  ] =
    context
      .raceDate
      .split("-");

  const year =
    Number(yearRaw);

  const month =
    Number(monthRaw);

  const day =
    Number(dayRaw);

  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const tokens =
    new Set(
      material
        .split(/\s+/)
        .filter(Boolean)
    );

  const monthName =
    MONTHS[
      month-1
    ];

  const yy =
    String(year)
      .slice(-2);

  const compact =
    `${day}${month}${yy}`;

  const compactPadded =
    `${String(day).padStart(2,"0")}${String(month).padStart(2,"0")}${yy}`;

  const hasCompact =
    material.includes(
      compact
    ) ||
    material.includes(
      compactPadded
    );

  const hasDay =
    tokens.has(
      String(day)
    ) ||
    tokens.has(
      String(day)
        .padStart(
          2,
          "0"
        )
    );

  const hasMonth =
    material.includes(
      monthName
    ) ||
    tokens.has(
      String(month)
    ) ||
    tokens.has(
      String(month)
        .padStart(
          2,
          "0"
        )
    );

  const hasYear =
    tokens.has(
      String(year)
    ) ||
    tokens.has(
      yy
    );

  const sourceConfig =
    expertSourceConfig(
      context
        .source
        .source_key
    );

  const dateEvidence =
    evidence.hasDate ||
    hasCompact ||
    (
      hasDay &&
      hasMonth &&
      (
        hasYear ||
        sourceConfig
          .allowYearlessDateEvidence
      )
    );

  if (
    plan
      .requireCandidateDateEvidence ===
        true &&
    !dateEvidence
  ) {
    return null;
  }

  const topicEvidence =
    evidence
      .hasPredictionLanguage ||
    TOPIC_TERMS.some(
      term =>
        material.includes(
          term
        )
    );

  /*
   * HorsAI-style loose ranking:
   *
   * city = essential
   * date = strong boost
   * prediction language = boost
   *
   * It is intentionally NOT the final gate.
   */
  let score =
    matchedCities.length *
    4;

  if (dateEvidence)
    score+=5;

  if (hasCompact)
    score+=2;

  if (topicEvidence)
    score+=2;

  score+=
    Math.max(
      0,
      Math.min(
        evidence.score,
        8
      )
    );

  if (
    score < 6
  ) {
    return null;
  }

  return {
    url:
      link.url,

    text:
      link.text,

    score,

    matchedCities,

    dateEvidence,

    topicEvidence,

    fromUrl,

    discoveryStage
  };
}


function directLooseCandidate(
  direct:
    DirectArticleCandidate
):LooseCandidate {
  return {
    url:
      direct.url,

    text:
      direct.url,

    score:100,

    matchedCities:[
      direct.city
    ],

    dateEvidence:true,
    topicEvidence:true,

    fromUrl:
      direct.url,

    discoveryStage:
      "direct-source-url"
  };
}


function coverage(
  candidates:
    VerifiedCandidate[],

  cities:
    string[]
) {
  const covered =
    new Set<string>();

  for (
    const candidate of
    candidates
  ) {
    for (
      const city of
      candidate
        .matchedCities
    ) {
      covered.add(
        normalizeExpertSearchText(
          city
        )
      );
    }
  }

  const missing =
    cities.filter(
      city =>
        !covered.has(
          normalizeExpertSearchText(
            city
          )
        )
    );

  return {
    covered:[
      ...covered
    ],

    missing,

    complete:
      missing.length ===
      0
  };
}


function coverageCount(
  candidates:
    VerifiedCandidate[],

  city:
    string
) {
  const target =
    normalizeExpertSearchText(
      city
    );

  return candidates
    .filter(
      candidate =>
        candidate
          .matchedCities
          .some(
            matched =>
              normalizeExpertSearchText(
                matched
              ) ===
              target
          )
    )
    .length;
}


function greedySelection(
  candidates:
    VerifiedCandidate[],

  cities:
    string[]
):VerifiedCandidate[] {
  const selected:
    VerifiedCandidate[] =
    [];

  const uncovered =
    new Set(
      cities.map(
        normalizeExpertSearchText
      )
    );

  const remaining =
    [...candidates];

  while (
    uncovered.size &&
    remaining.length
  ) {
    remaining.sort(
      (
        first,
        second
      ) => {
        const firstNew =
          first
            .matchedCities
            .filter(
              city =>
                uncovered.has(
                  normalizeExpertSearchText(
                    city
                  )
                )
            )
            .length;

        const secondNew =
          second
            .matchedCities
            .filter(
              city =>
                uncovered.has(
                  normalizeExpertSearchText(
                    city
                  )
                )
            )
            .length;

        const firstVerified =
          first.status ===
            "verified"
            ? 1
            : 0;

        const secondVerified =
          second.status ===
            "verified"
            ? 1
            : 0;

        return (
          secondNew -
            firstNew ||
          secondVerified -
            firstVerified ||
          second.score -
            first.score
        );
      }
    );

    const winner =
      remaining.shift();

    if (!winner)
      break;

    const newCities =
      winner
        .matchedCities
        .filter(
          city =>
            uncovered.has(
              normalizeExpertSearchText(
                city
              )
            )
        );

    if (
      !newCities.length
    ) {
      continue;
    }

    selected.push(
      winner
    );

    for (
      const city of
      newCities
    ) {
      uncovered.delete(
        normalizeExpertSearchText(
          city
        )
      );
    }
  }

  return selected;
}


export async function resolveVerifiedArticleTargets(
  context:
    ExpertAdapterContext,

  plan:
    VerifiedArticlePlan
):Promise<ExpertTargetResolution> {
  const diagnostics:any = {
    traceVersion:
      "verified-article-discovery-v1",

    architecture:
      "source-urls>http>anchor-href-score>cf-content>cf-links>cf-scrape>bounded-puppeteer>full-body-verify>workers-ai-ambiguity",

    listingAttempts:[],
    verificationAttempts:[],
    ai:null,

    policy:{
      allowPartialCoverage:
        plan.allowPartialCoverage ===
        true
    },

    browser:{
      launches:0,
      navigations:0,
      budget:
        plan
          .browserNavigationBudget ??
        2
    }
  };

  const maxCandidates =
    plan.maxCandidates ??
    8;

  const maxVerifiedPerCity =
    plan
      .maxVerifiedPerCity ??
    1;

  const browserBudget =
    plan
      .browserNavigationBudget ??
    2;

  let browser:any =
    null;

  let page:any =
    null;

  let anyAcquisitionWorked =
    false;

  const looseByUrl =
    new Map<
      string,
      LooseCandidate
    >();

  const verifiedByUrl =
    new Map<
      string,
      VerifiedCandidate
    >();


  async function ensureBrowser() {
    if (!browser) {
      browser =
        await puppeteer.launch(
          context.env.BROWSER as any
        );

      diagnostics
        .browser
        .launches++;
    }

    if (!page) {
      page =
        await browser.newPage();
    }

    return page;
  }


  async function waitForBrowserBody(
    current:any
  ) {
    for (
      let attempt=0;
      attempt<24;
      attempt++
    ) {
      const state =
        await current.evaluate(
          () => ({
            title:
              document.title ??
              "",

            text:
              document.body
                ?.innerText ??
              ""
          })
        );

      const material =
        normalizeExpertSearchText(
          [
            state.title,
            state.text
          ].join(" ")
        );

      const challenge =
        material.includes(
          "just a moment"
        ) ||
        material.includes(
          "enable javascript and cookies to continue"
        );

      if (
        !challenge &&
        state.text.length >=
          300
      ) {
        return;
      }

      await new Promise<void>(
        resolve =>
          setTimeout(
            resolve,
            250
          )
      );
    }
  }


  async function browserHtml(
    url:string
  ) {
    if (
      diagnostics
        .browser
        .navigations >=
      browserBudget
    ) {
      throw new Error(
        "PUPPETEER_NAVIGATION_BUDGET_EXHAUSTED"
      );
    }

    const current =
      await ensureBrowser();

    diagnostics
      .browser
      .navigations++;

    await current.goto(
      url,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          8_000
      }
    );

    await current.waitForSelector(
      "body",
      {
        timeout:
          4_000
      }
    );

    await waitForBrowserBody(
      current
    );

    return {
      html:
        String(
          await current.content()
        ),

      finalUrl:
        String(
          current.url()
        )
    };
  }


  async function discoverPage(
    discoveryUrl:string
  ) {
    const stages:
      ListingStage[] = [
        "http",
        "cf-content",
        "cf-links",
        "cf-scrape",
        ...(
          plan
            .allowPuppeteerDiscovery
            ? [
                "puppeteer" as const
              ]
            : []
        ),

        "wp-json"
      ];

    for (
      const stage of
      stages
    ) {
      try {
        let links:
          RawLink[] = [];

        let bodyLength:
          number |
          null =
          null;

        if (
          stage ===
          "http"
        ) {
          const acquired =
            await acquireHttpHtml(
              discoveryUrl,
              {
                timeoutMs:
                  5_000,

                minimumBytes:
                  200,

                userAgent:
                  "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
              }
            );

          bodyLength =
            acquired.bodyLength;

          links =
            linksFromHtml(
              acquired.finalUrl ??
                discoveryUrl,
              acquired.html,
              plan.listingCardContext ===
                true
            );

        } else if (
          stage ===
          "cf-content"
        ) {
          const acquired =
            await acquireCfContentHtml(
              context.env,
              discoveryUrl
            );

          bodyLength =
            acquired.bodyLength;

          links =
            linksFromHtml(
              discoveryUrl,
              acquired.html,
              plan.listingCardContext ===
                true
            );

        } else if (
          stage ===
          "cf-links"
        ) {
          const acquired =
            await acquireCfLinks(
              context.env,
              discoveryUrl
            );

          links =
            acquired
              .links
              .map(
                url => ({
                  url,
                  text:""
                })
              );

        } else if (
          stage ===
          "cf-scrape"
        ) {
          const acquired =
            await acquireCfScrapeHtml(
              context.env,
              discoveryUrl
            );

          bodyLength =
            acquired.bodyLength;

          links =
            linksFromHtml(
              discoveryUrl,
              acquired.html,
              plan.listingCardContext ===
                true
            );

        } else if (
          stage ===
          "wp-json"
        ) {
          const acquired =
            await acquireWpJsonSearchLinks(
              discoveryUrl,
              context.cities
            );

          bodyLength =
            acquired.links.length;

          links =
            acquired.links.map(
              url => ({
                url,
                text:""
              })
            );

        } else {
          const acquired =
            await browserHtml(
              discoveryUrl
            );

          bodyLength =
            acquired
              .html
              .length;

          links =
            linksFromHtml(
              acquired.finalUrl,
              acquired.html,
              plan.listingCardContext ===
                true
            );
        }

        anyAcquisitionWorked =
          true;

        const structural =
          links.filter(
            link =>
              plan.ownsArticle(
                link.url
              )
          );

        const scored =
          structural
            .map(
              link =>
                looseCandidate(
                  context,
                  plan,
                  discoveryUrl,
                  stage,
                  link
                )
            )
            .filter(
              (
                value
              ): value is
                LooseCandidate =>
                Boolean(value)
            )
            .sort(
              (
                first,
                second
              ) =>
                second.score -
                first.score
            );

        /*
         * scoredCandidates=0 with structuralLinks>0 is
         * otherwise a dead end: ownsArticle() matched real
         * article-shaped URLs, but nothing says WHY every one
         * of them then failed looseCandidate's gates (missing
         * city/date evidence, or a negative-language hit from
         * boilerplate card text). Surface that directly on a
         * few real structural links instead of re-guessing it
         * blind next time.
         */
        const rejectedSample=
          scored.length ===
            0 &&
          structural.length >
            0
            ? structural
                .slice(0,3)
                .map(
                  link => {
                    const material=
                      normalizeExpertSearchText(
                        [
                          link.text,
                          decodedUrl(
                            link.url
                          )
                        ].join(" ")
                      );

                    const evidence=
                      candidateEvidence(
                        context
                          .source
                          .source_key,

                        link.url,
                        link.text,
                        context.raceDate,
                        context.cities,
                        link.text
                      );

                    return {
                      url:
                        link.url,

                      textSample:
                        link.text.slice(
                          0,
                          200
                        ),

                      matchedCities:
                        evidence.matchedCities,

                      hasDate:
                        evidence.hasDate,

                      hasPredictionLanguage:
                        evidence
                          .hasPredictionLanguage,

                      hasNegativeLanguage:
                        evidence
                          .hasNegativeLanguage,

                      materialLength:
                        material.length
                    };
                  }
                )
            : undefined;

        diagnostics
          .listingAttempts
          .push({
            url:
              discoveryUrl,

            stage,

            bodyLength,

            totalLinks:
              links.length,

            structuralLinks:
              structural.length,

            scoredCandidates:
              scored.length,

            rejectedSample,

            sample:
              scored
                .slice(0,5)
                .map(
                  candidate => ({
                    url:
                      candidate.url,

                    score:
                      candidate.score,

                    cities:
                      candidate
                        .matchedCities,

                    dateEvidence:
                      candidate
                        .dateEvidence,

                    topicEvidence:
                      candidate
                        .topicEvidence
                  })
                )
          });

        /*
         * Once a transport gives useful candidates,
         * don't pay for lower transports on same page.
         */
        if (
          scored.length
        ) {
          for (
            const candidate of
            scored
          ) {
            const old =
              looseByUrl.get(
                candidate.url
              );

            if (
              !old ||
              candidate.score >
                old.score
            ) {
              looseByUrl.set(
                candidate.url,
                candidate
              );
            }
          }

          return;
        }

      } catch(error) {
        diagnostics
          .listingAttempts
          .push({
            url:
              discoveryUrl,

            stage,

            error:
              errorMessage(
                error
              )
          });

        /*
         * Continue this discovery URL through CF Content,
         * CF Links, CF Scrape and bounded browser as configured.
         */

      }
    }
  }


  async function verify(
    candidate:
      LooseCandidate
  ):Promise<
    VerifiedCandidate |
    null
  > {
    const cached =
      verifiedByUrl.get(
        candidate.url
      );

    if (cached)
      return cached;

    const stages:
      ArticleStage[] = [
        "http",
        "cf-content",
        "cf-scrape",
        ...(
          plan
            .allowPuppeteerArticle
            ? [
                "puppeteer" as const
              ]
            : []
        ),

        "wp-json"
      ];

    let restricted:
      VerifiedCandidate |
      null =
      null;

    for (
      const stage of
      stages
    ) {
      try {
        let html:string;
        let bodyLength:number;

        if (
          stage !==
          "puppeteer"
        ) {
          const acquired =
            await acquireArticleStageHtml(
              context.env,
              candidate.url,
              stage
            );

          html =
            acquired.html;

          bodyLength =
            acquired.bodyLength;

        } else {
          const acquired =
            await browserHtml(
              candidate.url
            );

          html =
            acquired.html;

          bodyLength =
            html.length;
        }

        anyAcquisitionWorked =
          true;

        const article =
          expertArticleTextFromHtml(
            html
          );

        const heading =
          articleHeading(
            html
          );

        const restriction =
          restrictionState(
            context
              .source
              .source_key,
            article.text
          );

        /*
         * FINAL URL VERIFICATION:
         *
         * full article body is positive evidence,
         * but hard-negative identity remains local to H1/title.
         */
        const evidence =
          candidateEvidence(
            context
              .source
              .source_key,

            candidate.url,

            [
              heading,
              article.text
            ]
              .filter(Boolean)
              .join(" "),

            context.raceDate,
            context.cities,

            heading ||
              candidate.text
          );

        const accepted =
          article.outputCharacters >=
            180 &&
          evidence.hasDate &&
          evidence.hasCity &&
          evidence
            .hasPredictionLanguage &&
          !evidence
            .hasNegativeLanguage &&
          !restriction
            .restricted;

        diagnostics
          .verificationAttempts
          .push({
            url:
              candidate.url,

            stage,

            bodyLength,

            articleCharacters:
              article
                .outputCharacters,

            heading:
              heading.slice(
                0,
                300
              ),

            hasDate:
              evidence.hasDate,

            hasCity:
              evidence.hasCity,

            matchedCities:
              evidence
                .matchedCities,

            hasPredictionLanguage:
              evidence
                .hasPredictionLanguage,

            hasNegativeLanguage:
              evidence
                .hasNegativeLanguage,

            restricted:
              restriction
                .restricted,

            restrictionTerms:
              restriction.hits,

            notFoundHit:
              restriction.notFoundHit,

            accepted
          });

        /*
         * We still accept the URL identity as a target when
         * the actual article is demonstrably access-restricted.
         *
         * This lets Yaris Analizi remain correctly classified
         * as access-restricted instead of not-published.
         */
        if (
          restriction
            .restricted &&
          candidate
            .dateEvidence &&
          candidate
            .matchedCities
            .length
        ) {
          restricted = {
            ...candidate,

            verificationStage:
              stage,

            status:
              "access-restricted",

            articleText:
              article.text
                .slice(
                  0,
                  2000
                )
          };

          continue;
        }

        if (!accepted)
          continue;

        const verified:
          VerifiedCandidate = {
            ...candidate,

            score:
              candidate.score +
              Math.max(
                0,
                Math.min(
                  evidence.score,
                  15
                )
              ),

            /*
             * Article body verifies the candidate identity;
             * it must NEVER expand its city scope.
             *
             * Example:
             * an Ankara article mentioning Kocaeli elsewhere
             * cannot satisfy Kocaeli coverage.
             */
            matchedCities:
              candidate
                .matchedCities
                .filter(
                  city =>
                    evidence
                      .matchedCities
                      .some(
                        matched =>
                          normalizeExpertSearchText(
                            matched
                          ) ===
                          normalizeExpertSearchText(
                            city
                          )
                      )
                ),

            verificationStage:
              stage,

            status:
              "verified",

            articleText:
              [
                heading,
                article.text
                  .slice(
                    0,
                    1800
                  )
              ]
                .filter(Boolean)
                .join(" ")
          };

        verifiedByUrl.set(
          candidate.url,
          verified
        );

        return verified;

      } catch(error) {
        diagnostics
          .verificationAttempts
          .push({
            url:
              candidate.url,

            stage,

            error:
              errorMessage(
                error
              )
          });

        /*
         * One transport's 404/410 is not source-level proof.
         * Continue to the next acquisition transport.
         */

      }
    }

    if (restricted) {
      verifiedByUrl.set(
        candidate.url,
        restricted
      );

      return restricted;
    }

    return null;
  }


  async function finalSelection(
    values:
      VerifiedCandidate[]
  ) {
    const deterministic =
      greedySelection(
        values,
        context.cities
      );

    const deterministicCoverage =
      coverage(
        deterministic,
        context.cities
      );

    if (
      !deterministicCoverage
        .complete
    ) {
      return {
        selected:
          deterministic,

        method:
          "deterministic",

        coverage:
          deterministicCoverage
      };
    }

    /*
     * Workers AI is NOT the crawler.
     *
     * It only resolves ambiguity among already full-body
     * verified candidate articles.
     */
    const aiPool =
      values
        .filter(
          candidate =>
            candidate.status ===
            "verified"
        );

    if (
      aiPool.length <=
        deterministic.length ||
      !coverage(
        aiPool,
        context.cities
      ).complete
    ) {
      return {
        selected:
          deterministic,

        method:
          "deterministic",

        coverage:
          deterministicCoverage
      };
    }

    try {
      const ai =
        await selectExpertCandidateUrlsWithWorkersAi(
          context.env,
          {
            sourceName:
              plan.sourceName,

            raceDate:
              context.raceDate,

            cities:
              context.cities,

            candidates:
              aiPool.map(
                candidate => ({
                  url:
                    candidate.url,

                  text:
                    candidate
                      .articleText,

                  score:
                    candidate.score
                })
              )
          }
        );

      const selected =
        unique(
          ai.urls
        )
          .map(
            url =>
              aiPool.find(
                candidate =>
                  candidate.url ===
                  url
              )
          )
          .filter(
            (
              value
            ): value is
              VerifiedCandidate =>
              Boolean(value)
          );

      const aiCoverage =
        coverage(
          selected,
          context.cities
        );

      diagnostics.ai = {
        candidateCount:
          aiPool.length,

        selected:
          selected.map(
            candidate =>
              candidate.url
          ),

        coverage:
          aiCoverage,

        usage:
          ai.diagnostics
      };

      if (
        aiCoverage.complete
      ) {
        return {
          selected,

          method:
            "workers-ai",

          coverage:
            aiCoverage
        };
      }

    } catch(error) {
      diagnostics.ai = {
        error:
          errorMessage(
            error
          ),

        fallback:
          deterministic.map(
            candidate =>
              candidate.url
          )
      };
    }

    return {
      selected:
        deterministic,

      method:
        "deterministic",

      coverage:
        deterministicCoverage
    };
  }


  try {
    const verified:
      VerifiedCandidate[] =
      [];

    /*
     * 1. Deterministic direct source URLs.
     */
    for (
      const direct of
      (
        plan.directCandidates?.(
          context
        ) ??
        []
      )
    ) {
      if (
        !plan.ownsArticle(
          direct.url
        )
      ) {
        continue;
      }

      const candidate =
        directLooseCandidate(
          direct
        );

      looseByUrl.set(
        candidate.url,
        candidate
      );

      const value =
        await verify(
          candidate
        );

      if (value) {
        verified.push(
          value
        );
      }
    }

    let directCoverage =
      coverage(
        verified,
        context.cities
      );

    /*
     * 2. Listing/search discovery only if direct URLs
     * did not already solve coverage.
     */
    if (
      !directCoverage.complete
    ) {
      for (
        const discoveryUrl of
        unique(
          plan.discoveryUrls(
            context
          )
        )
      ) {
        await discoverPage(
          discoveryUrl
        );

        /*
         * HorsAI behaviour:
         * once discovery has candidates for every target city,
         * STOP browsing listings and start verifying articles.
         *
         * Do not spend article browser budget on page 2/3/4.
         */
        const looseCityCoverage =
          new Set(
            [
              ...looseByUrl.values()
            ]
              .flatMap(
                candidate =>
                  candidate.matchedCities
              )
              .map(
                city =>
                  normalizeExpertSearchText(
                    city
                  )
              )
          );

        const looseCoverageComplete =
          context.cities.every(
            city =>
              looseCityCoverage.has(
                normalizeExpertSearchText(
                  city
                )
              )
          );

        if (
          looseCoverageComplete
        ) {
          diagnostics
            .listingAttempts
            .push({
              stage:
                "early-stop",

              reason:
                "ALL_TARGET_CITIES_HAVE_LOOSE_ARTICLE_CANDIDATES",

              cities:
                context.cities
            });

          break;
        }
      }

      const ranked =
        [
          ...looseByUrl.values()
        ]
          .sort(
            (
              first,
              second
            ) =>
              second.score -
              first.score
          )
          .slice(
            0,
            maxCandidates
          );

      for (
        const candidate of
        ranked
      ) {
        if (
          verifiedByUrl.has(
            candidate.url
          )
        ) {
          continue;
        }

        const enoughAlready =
          context.cities
            .every(
              city =>
                coverageCount(
                  verified,
                  city
                ) >=
                maxVerifiedPerCity
            );

        if (enoughAlready)
          break;

        const value =
          await verify(
            candidate
          );

        if (value) {
          verified.push(
            value
          );
        }
      }
    }

    const selected =
      await finalSelection(
        verified
      );

    diagnostics.final = {
      looseCandidates:
        [
          ...looseByUrl.values()
        ]
          .sort(
            (
              first,
              second
            ) =>
              second.score -
              first.score
          )
          .slice(
            0,
            20
          )
          .map(
            candidate => ({
              url:
                candidate.url,

              score:
                candidate.score,

              cities:
                candidate
                  .matchedCities,

              dateEvidence:
                candidate
                  .dateEvidence,

              topicEvidence:
                candidate
                  .topicEvidence,

              from:
                candidate.fromUrl,

              stage:
                candidate
                  .discoveryStage
            })
          ),

      verified:
        verified.map(
          candidate => ({
            url:
              candidate.url,

            score:
              candidate.score,

            cities:
              candidate
                .matchedCities,

            status:
              candidate.status,

            verificationStage:
              candidate
                .verificationStage
          })
        ),

      selected:
        selected
          .selected
          .map(
            candidate =>
              candidate.url
          ),

      selectionMethod:
        selected.method,

      coverage:
        selected.coverage
    };

    const partialCoverageAllowed =
      plan.allowPartialCoverage ===
        true &&
      selected
        .selected
        .some(
          candidate =>
            candidate.status ===
            "verified"
        );

    if (
      (
        selected
          .coverage
          .complete ||
        partialCoverageAllowed
      ) &&
      selected
        .selected
        .length
    ) {
      return {
        status:"ready",

        mode:"article",

        targets:
          unique(
            selected
              .selected
              .map(
                candidate =>
                  candidate.url
              )
          ),

        discoveredFromUrl:
          selected
            .selected[0]
            ?.fromUrl ??
          null,

        discoveryMethod:
          !selected
            .coverage
            .complete
            ? "verified-article-http-first-partial"
            : selected.method ===
                "workers-ai"
              ? "verified-article-workers-ai"
              : "verified-article-http-first",

        diagnostics
      };
    }

    return {
      status:
        anyAcquisitionWorked
          ? "not-published"
          : "unavailable",

      mode:"article",
      targets:[],

      discoveredFromUrl:null,
      discoveryMethod:null,

      diagnostics
    };

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // non-fatal
      }
    }
  }
}


export function createVerifiedArticleAdapter(
  plan:
    VerifiedArticlePlan
):ExpertAdapter {
  const adapter:
    ExpertAdapter = {
      sourceKey:
        plan.sourceKey,

      async resolve(context) {
        const primary =
          await resolveVerifiedArticleTargets(
            context,
            plan
          );

        if (
          primary.status ===
          "ready"
        ) {
          return primary;
        }

        const fallback =
          plan.fallback ??
          "none";

        if (
          fallback ===
          "none"
        ) {
          return primary;
        }

        /*
         * Existing proven resolver remains LAST RESCUE.
         * New primary discovery is still HTTP-first.
         */
        const legacy =
          await resolveArticleAdapter(
            context,
            fallback ===
              "legacy"
              ? {
                  allowFeed:true,
                  verifyTargets:false
                }
              : {
                  landingUrls:[],
                  allowGeneric:false,
                  allowFeed:true,
                  verifyTargets:true,
                  requireCityCoverage:true
                }
          );

        if (
          legacy.status ===
          "ready"
        ) {
          return {
            ...legacy,

            diagnostics:{
              primary:
                primary.diagnostics,

              fallback:
                legacy.diagnostics
            }
          };
        }

        return {
          ...primary,

          diagnostics:{
            primary:
              primary.diagnostics,

            fallback:
              legacy.diagnostics
          }
        };
      }
    };


  /*
   * Static sources must remain browser-free /
   * adapter-acquisition-free by contract.
   *
   * Only sources which explicitly request special acquisition
   * receive acquireHtml + ownsAcquisition.
   */
  if (
    plan.adapterOwnedExtraction ===
    true
  ) {
    adapter.ownsAcquisition =
      (
        url:string
      ) =>
        plan.ownsArticle(
          url
        );

    adapter.acquireHtml =
      context =>
        acquireHttpFirstArticleHtml(
          context,
          {
            allowPuppeteer:
              plan
                .allowPuppeteerArticle ===
              true,

            prepareAcquired:
              plan
                .prepareArticleHtml
                ? acquired =>
                    plan
                      .prepareArticleHtml!(
                        context,
                        acquired
                      )
                : undefined
          }
        );
  }


  return adapter;
}
