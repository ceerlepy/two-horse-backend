import puppeteer from "@cloudflare/puppeteer";
import { load } from "cheerio";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import {
  candidateEvidence
} from "../discovery";

import {
  isAllowedDiscoveredArticleUrl
} from "../source-policy";

import {
  cleanExpertInlineText,
  normalizeExpertSearchText
} from "../text-normalization";

import {
  selectExpertCandidateUrlsWithWorkersAi
} from "../workers-ai-discovery";

import type {
  ExpertAcquireContext,
  ExpertAdapterContext,
  ExpertTargetResolution
} from "./types";


/*
 * Part 5 bounded acquisition rules:
 *
 * - listing page navigation must be cheap
 * - semantic selector is the readiness condition
 * - no networkidle2 for editorial listing discovery
 * - fallback occurs ONLY when acquisition is unusable
 * - a usable page with no target means NEXT PAGE
 * - Puppeteer is last resort
 * - maximum one browser launch per resolver execution
 */
const LISTING_GOTO_TIMEOUT_MS =
  12_000;

const LISTING_SELECTOR_TIMEOUT_MS =
  7_000;

const ARTICLE_GOTO_TIMEOUT_MS =
  15_000;

const ARTICLE_SELECTOR_TIMEOUT_MS =
  9_000;


type Stage =
  | "cf-content"
  | "cf-scrape"
  | "cf-links"
  | "puppeteer";


const STAGES:Stage[] = [
  "cf-content",
  "cf-scrape",
  "cf-links",
  "puppeteer"
];


export interface ResilientArticleResolveOptions {
  landingUrls:string[];
  readySelector:string;
  maxPages?:number;
  urlPredicate?:(url:string)=>boolean;
}


export interface ResilientArticleAcquireOptions {
  readySelector:string;
}


interface RawAnchor {
  href:string;
  text:string;
  identityText:string;
}


interface Candidate {
  url:string;
  text:string;
  score:number;
  matchedCities:string[];
  stage:string;
  pageUrl:string;
}


function errorMessage(
  value:unknown
):string {
  return value instanceof Error
    ? value.message
    : String(value);
}


function unwrap(
  value:any
):any {
  return (
    value &&
    typeof value === "object" &&
    "result" in value
  )
    ? value.result
    : value;
}


function findHtml(
  value:any
):string|null {
  if (!value)
    return null;

  if (
    typeof value === "string" &&
    value.length > 100
  )
    return value;

  if (
    typeof value === "object" &&
    typeof value.html === "string" &&
    value.html.length > 100
  )
    return value.html;

  if (Array.isArray(value)) {
    for (const child of value) {
      const found =
        findHtml(child);

      if (found)
        return found;
    }

    return null;
  }

  if (typeof value === "object") {
    for (
      const child of
      Object.values(value)
    ) {
      const found =
        findHtml(child);

      if (found)
        return found;
    }
  }

  return null;
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
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    )
      return null;

    url.hash="";

    return url.toString();

  } catch {
    return null;
  }
}


function urlKey(
  value:string
):string {
  try {
    const url =
      new URL(value);

    url.hash="";

    return url.toString();

  } catch {
    return value;
  }
}


function pagedUrl(
  base:string,
  page:number
):string {
  if (page <= 1)
    return base;

  const url =
    new URL(base);

  url.pathname =
    url.pathname
      .replace(/\/+$/g,"") +
    `/page/${page}/`;

  return url.toString();
}


function anchorsFromHtml(
  html:string
):RawAnchor[] {
  const $ =
    load(html);

  $(
    "script,style,noscript,svg,canvas,iframe"
  ).remove();

  const output:RawAnchor[] =
    [];

  $("a[href]").each(
    (
      _index:number,
      element:any
    ) => {
      const anchor =
        $(element);

      const href =
        anchor.attr("href");

      if (!href)
        return;

      const container =
        anchor
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
          .first();

      const anchorText =
        cleanExpertInlineText(
          anchor.text(),
          1000
        );

      const contextText =
        cleanExpertInlineText(
          container.length
            ? container.text()
            : anchorText,
          1800
        );

      output.push({
        href,

        text:
          [
            anchorText,
            contextText
          ]
            .filter(Boolean)
            .join(" | "),

        identityText:
          contextText ||
          anchorText
      });
    }
  );

  return output;
}


function anchorsFromScrape(
  raw:any
):RawAnchor[] {
  const payload =
    unwrap(raw);

  const groups =
    Array.isArray(payload)
      ? payload
      : [];

  const output:RawAnchor[] =
    [];

  for (const group of groups) {
    const values =
      Array.isArray(
        group?.results
      )
        ? group.results
        : [];

    for (const value of values) {
      const attributes =
        Array.isArray(
          value?.attributes
        )
          ? value.attributes
          : [];

      const hrefAttribute =
        attributes.find(
          (attribute:any) =>
            String(
              attribute?.name ??
              ""
            ).toLowerCase() ===
            "href"
        );

      const href =
        hrefAttribute?.value
          ? String(
              hrefAttribute.value
            )
          : "";

      if (!href)
        continue;

      const text =
        cleanExpertInlineText(
          String(
            value?.text ??
            ""
          ),
          1200
        );

      output.push({
        href,
        text,
        identityText:text
      });
    }
  }

  return output;
}


function allowedListingUrl(
  context:ExpertAdapterContext,
  pageUrl:string,
  href:string,
  predicate?:(url:string)=>boolean
):string|null {
  const url =
    normalizeUrl(
      pageUrl,
      href
    );

  if (
    !url ||
    !isAllowedDiscoveredArticleUrl(
      context.source.source_key,
      url
    ) ||
    (
      predicate &&
      !predicate(url)
    )
  )
    return null;

  return url;
}


function usableAnchorCount(
  context:ExpertAdapterContext,
  pageUrl:string,
  anchors:RawAnchor[],
  predicate?:(url:string)=>boolean
):number {
  let count=0;

  for (const anchor of anchors) {
    if (
      allowedListingUrl(
        context,
        pageUrl,
        anchor.href,
        predicate
      )
    )
      count++;
  }

  return count;
}


function candidatesFromAnchors(
  context:ExpertAdapterContext,
  pageUrl:string,
  anchors:RawAnchor[],
  stage:string,
  predicate?:(url:string)=>boolean
):Candidate[] {
  const byUrl =
    new Map<
      string,
      Candidate
    >();

  for (const anchor of anchors) {
    const url =
      allowedListingUrl(
        context,
        pageUrl,
        anchor.href,
        predicate
      );

    if (!url)
      continue;

    const evidence =
      candidateEvidence(
        context
          .source
          .source_key,

        url,
        anchor.text,
        context.raceDate,
        context.cities,
        anchor.identityText
      );

    if (
      !evidence.hasDate ||
      !evidence.hasCity ||
      !evidence
        .hasPredictionLanguage ||
      evidence
        .hasNegativeLanguage
    )
      continue;

    const candidate:Candidate = {
      url,
      text:anchor.text,
      score:evidence.score,

      matchedCities:
        evidence.matchedCities,

      stage,
      pageUrl
    };

    const old =
      byUrl.get(
        urlKey(url)
      );

    if (
      !old ||
      candidate.score >
        old.score ||
      (
        candidate.score ===
          old.score &&
        candidate.text.length >
          old.text.length
      )
    ) {
      byUrl.set(
        urlKey(url),
        candidate
      );
    }
  }

  return [
    ...byUrl.values()
  ];
}


function mergeCandidates(
  pool:Map<string,Candidate>,
  candidates:Candidate[]
):void {
  for (const candidate of candidates) {
    const key =
      urlKey(
        candidate.url
      );

    const old =
      pool.get(key);

    if (
      !old ||
      candidate.score >
        old.score ||
      (
        candidate.score ===
          old.score &&
        candidate.text.length >
          old.text.length
      )
    ) {
      pool.set(
        key,
        candidate
      );
    }
  }
}


function candidatePool(
  pool:Map<string,Candidate>
):Candidate[] {
  return [
    ...pool.values()
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
      220
    );
}


function coverage(
  candidates:Candidate[],
  cities:string[]
) {
  const matched =
    new Set<string>();

  for (const candidate of candidates) {
    for (
      const city of
      candidate.matchedCities
    ) {
      matched.add(
        normalizeExpertSearchText(
          city
        )
      );
    }
  }

  const matchedCities =
    cities.filter(
      city =>
        matched.has(
          normalizeExpertSearchText(
            city
          )
        )
    );

  const missingCities =
    cities.filter(
      city =>
        !matched.has(
          normalizeExpertSearchText(
            city
          )
        )
    );

  return {
    matchedCities,
    missingCities,

    complete:
      missingCities.length ===
      0
  };
}


function fingerprint(
  candidates:Candidate[]
):string {
  return candidates
    .map(
      candidate =>
        [
          candidate.url,
          candidate.score,
          candidate.text
        ].join("|")
    )
    .join("\n");
}


async function quickContent(
  context:any,
  url:string,
  selector:string,
  gotoTimeout:number,
  selectorTimeout:number
) {
  const response =
    await context.env.BROWSER
      .quickAction(
        "content",
        {
          url,

          gotoOptions:{
            waitUntil:
              "domcontentloaded",

            timeout:
              gotoTimeout
          },

          waitForSelector:{
            selector,

            timeout:
              selectorTimeout
          },

          rejectResourceTypes:[
            "image",
            "media",
            "font"
          ]
        } as any
      );

  if (!response.ok) {
    throw new Error(
      `CF_CONTENT_READY_HTTP_${response.status}`
    );
  }

  const raw:any =
    await response.json();

  const payload =
    unwrap(raw);

  const html =
    typeof payload ===
      "string"
      ? payload
      : findHtml(payload);

  if (!html) {
    throw new Error(
      "CF_CONTENT_READY_HTML_NOT_FOUND"
    );
  }

  if (html.length < 500) {
    throw new Error(
      `CF_CONTENT_READY_TOO_SMALL:${html.length}`
    );
  }

  return {
    html,
    status:
      response.status
  };
}


async function quickScrapeAnchors(
  context:ExpertAdapterContext,
  url:string,
  selector:string
) {
  const response =
    await context.env.BROWSER
      .quickAction(
        "scrape",
        {
          url,

          elements:[
            {
              selector:
                "a[href]"
            }
          ],

          gotoOptions:{
            waitUntil:
              "domcontentloaded",

            timeout:
              LISTING_GOTO_TIMEOUT_MS
          },

          waitForSelector:{
            selector,

            timeout:
              LISTING_SELECTOR_TIMEOUT_MS
          },

          rejectResourceTypes:[
            "image",
            "media",
            "font"
          ]
        } as any
      );

  if (!response.ok) {
    throw new Error(
      `CF_SCRAPE_READY_HTTP_${response.status}`
    );
  }

  const anchors =
    anchorsFromScrape(
      await response.json()
    );

  if (!anchors.length) {
    throw new Error(
      "CF_SCRAPE_READY_ANCHORS_EMPTY"
    );
  }

  return {
    anchors,
    status:
      response.status
  };
}


function rawLinkValues(
  payload:unknown
):unknown[] {
  if (Array.isArray(payload))
    return payload;

  if (
    payload &&
    typeof payload === "object"
  ) {
    const links =
      (
        payload as {
          links?:unknown
        }
      ).links;

    if (Array.isArray(links))
      return links;
  }

  return [];
}


async function quickLinks(
  context:ExpertAdapterContext,
  url:string,
  selector:string
) {
  const response =
    await context.env.BROWSER
      .quickAction(
        "links",
        {
          url,

          excludeExternalLinks:
            true,

          gotoOptions:{
            waitUntil:
              "domcontentloaded",

            timeout:
              LISTING_GOTO_TIMEOUT_MS
          },

          waitForSelector:{
            selector,

            timeout:
              LISTING_SELECTOR_TIMEOUT_MS
          }
        } as any
      );

  if (!response.ok) {
    throw new Error(
      `CF_LINKS_READY_HTTP_${response.status}`
    );
  }

  const links =
    [
      ...new Set(
        rawLinkValues(
          unwrap(
            await response.json()
          )
        )
          .map(
            value =>
              String(value)
                .trim()
          )
          .filter(Boolean)
      )
    ];

  if (!links.length) {
    throw new Error(
      "CF_LINKS_READY_EMPTY"
    );
  }

  return {
    links,
    status:
      response.status
  };
}


async function browserAnchors(
  page:any,
  url:string,
  selector:string
) {
  await page.goto(
    url,
    {
      waitUntil:
        "domcontentloaded",

      timeout:
        LISTING_GOTO_TIMEOUT_MS
    }
  );

  await page.waitForSelector(
    selector,
    {
      timeout:
        LISTING_SELECTOR_TIMEOUT_MS
    }
  );

  const anchors =
    await page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll(
            "a[href]"
          )
        )
          .map(
            element => {
              const anchor =
                element as
                  HTMLAnchorElement;

              const container =
                anchor.closest(
                  [
                    "article",
                    ".post",
                    ".entry",
                    ".card",
                    ".item",
                    "li"
                  ].join(",")
                ) as
                  HTMLElement |
                  null;

              const anchorText =
                String(
                  anchor.innerText ??
                  anchor.textContent ??
                  ""
                )
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim()
                  .slice(
                    0,
                    1000
                  );

              const contextText =
                String(
                  container?.innerText ??
                  container?.textContent ??
                  anchorText
                )
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim()
                  .slice(
                    0,
                    1800
                  );

              return {
                href:
                  String(
                    anchor.href ??
                    ""
                  ),

                text:
                  [
                    anchorText,
                    contextText
                  ]
                    .filter(Boolean)
                    .join(" | "),

                identityText:
                  contextText ||
                  anchorText
              };
            }
          )
          .filter(
            value =>
              Boolean(
                value.href
              )
          )
    );

  return {
    anchors:
      anchors as
        RawAnchor[],

    finalUrl:
      String(
        page.url()
      )
  };
}


async function selectCandidates(
  context:ExpertAdapterContext,
  candidates:Candidate[]
) {
  try {
    const semantic =
      await selectExpertCandidateUrlsWithWorkersAi(
        context.env,
        {
          sourceName:
            context
              .source
              .source_name,

          raceDate:
            context.raceDate,

          cities:
            context.cities,

          candidates:
            candidates.map(
              candidate => ({
                url:
                  candidate.url,

                text:
                  candidate.text,

                score:
                  candidate.score
              })
            )
        }
      );

    const allowed =
      new Map<
        string,
        string
      >(
        candidates.map(
          candidate => [
            urlKey(
              candidate.url
            ),
            candidate.url
          ]
        )
      );

    const selected:
      string[] = [];

    for (
      const raw of
      semantic.urls
    ) {
      const normalized =
        normalizeUrl(
          candidates[0]
            ?.pageUrl ??
          raw,
          raw
        );

      if (!normalized)
        continue;

      const exact =
        allowed.get(
          urlKey(
            normalized
          )
        );

      if (
        exact &&
        !selected.includes(
          exact
        )
      ) {
        selected.push(
          exact
        );
      }
    }

    return {
      urls:selected,

      aiError:
        null as
          string |
          null,

      diagnostics:
        semantic.diagnostics
    };

  } catch(error) {
    return {
      urls:
        [] as string[],

      aiError:
        errorMessage(error),

      diagnostics:
        null
    };
  }
}


function selectedCoverage(
  urls:string[],
  candidates:Candidate[],
  cities:string[]
) {
  const selected =
    new Set(
      urls.map(
        urlKey
      )
    );

  return coverage(
    candidates.filter(
      candidate =>
        selected.has(
          urlKey(
            candidate.url
          )
        )
    ),
    cities
  );
}


/*
 * TRUE FALLBACK SEMANTICS
 *
 * PAGE 1:
 *   content
 *     acquisition usable -> parse -> next page / return
 *     acquisition unusable -> scrape
 *       unusable -> links
 *         unusable -> puppeteer
 *
 * Once one transport proves usable on a site, the same transport
 * becomes preferred for later archive pages.
 *
 * If Puppeteer is required, one browser is launched and reused.
 */
export async function resolveResilientArticleTargets(
  context:ExpertAdapterContext,
  options:ResilientArticleResolveOptions
):Promise<ExpertTargetResolution> {
  const maxPages =
    Math.max(
      1,
      Math.min(
        options.maxPages ??
          1,
        6
      )
    );

  const diagnostics:any = {
    traceVersion:
      "part5-resilient-v2",

    architecture:
      "page-first-adaptive:true-fallback",

    initialOrder:[
      "cf-content",
      "cf-scrape",
      "cf-links",
      "puppeteer"
    ],

    gotoWaitUntil:
      "domcontentloaded",

    listingGotoTimeoutMs:
      LISTING_GOTO_TIMEOUT_MS,

    selectorTimeoutMs:
      LISTING_SELECTOR_TIMEOUT_MS,

    readySelector:
      options.readySelector,

    maxPages,

    attempts:[],
    finalPool:[],
    finalSelection:null,

    browserLaunches:0
  };

  const pool =
    new Map<
      string,
      Candidate
    >();

  let successfulPages=0;

  /*
   * Adaptive stickiness:
   *
   * if scrape succeeds on page 1, page 2 starts from scrape.
   * if browser is required, later pages reuse that browser.
   */
  let preferredStageIndex=0;

  let browser:any=null;
  let browserPage:any=null;
  let browserLaunchAttempted=false;

  let lastSelectionFingerprint="";
  let lastAiError=false;

  try {
    for (
      const landingUrl of
      options.landingUrls
    ) {
      for (
        let pageNumber=1;
        pageNumber<=maxPages;
        pageNumber++
      ) {
        const pageUrl =
          pagedUrl(
            landingUrl,
            pageNumber
          );

        const pageStages =
          STAGES.slice(
            preferredStageIndex
          );

        let pageAcquired=false;

        for (
          const stage of
          pageStages
        ) {
          try {
            let anchors:
              RawAnchor[] = [];

            let metadata:any =
              {};

            if (
              stage ===
              "cf-content"
            ) {
              const acquired =
                await quickContent(
                  context,
                  pageUrl,
                  options.readySelector,
                  LISTING_GOTO_TIMEOUT_MS,
                  LISTING_SELECTOR_TIMEOUT_MS
                );

              anchors =
                anchorsFromHtml(
                  acquired.html
                );

              metadata = {
                status:
                  acquired.status,

                bodyLength:
                  acquired
                    .html
                    .length,

                anchorCount:
                  anchors.length
              };

            } else if (
              stage ===
              "cf-scrape"
            ) {
              const acquired =
                await quickScrapeAnchors(
                  context,
                  pageUrl,
                  options.readySelector
                );

              anchors =
                acquired.anchors;

              metadata = {
                status:
                  acquired.status,

                anchorCount:
                  anchors.length
              };

            } else if (
              stage ===
              "cf-links"
            ) {
              const acquired =
                await quickLinks(
                  context,
                  pageUrl,
                  options.readySelector
                );

              anchors =
                acquired.links.map(
                  href => ({
                    href,
                    text:href,
                    identityText:href
                  })
                );

              metadata = {
                status:
                  acquired.status,

                linkCount:
                  acquired.links
                    .length
              };

            } else {
              if (!browser) {
                if (
                  browserLaunchAttempted
                ) {
                  throw new Error(
                    "PUPPETEER_LAUNCH_ALREADY_FAILED"
                  );
                }

                browserLaunchAttempted=
                  true;

                browser =
                  await puppeteer.launch(
                    context.env.BROWSER
                      as any
                  );

                diagnostics.browserLaunches++;

                browserPage =
                  await browser.newPage();
              }

              const acquired =
                await browserAnchors(
                  browserPage,
                  pageUrl,
                  options.readySelector
                );

              anchors =
                acquired.anchors;

              metadata = {
                finalUrl:
                  acquired.finalUrl,

                anchorCount:
                  anchors.length
              };
            }


            /*
             * Acquisition succeeded only if it exposed at least
             * one real editorial/article URL for this adapter.
             *
             * Challenge shell / nav-only HTML is NOT success.
             */
            const structuralArticles =
              usableAnchorCount(
                context,
                pageUrl,
                anchors,
                options.urlPredicate
              );

            if (
              structuralArticles <
              1
            ) {
              throw new Error(
                "LISTING_STRUCTURALLY_UNUSABLE"
              );
            }


            pageAcquired=true;
            successfulPages++;

            preferredStageIndex =
              Math.max(
                0,
                STAGES.indexOf(
                  stage
                )
              );


            const candidates =
              candidatesFromAnchors(
                context,
                pageUrl,
                anchors,
                stage,
                options.urlPredicate
              );

            mergeCandidates(
              pool,
              candidates
            );

            const accumulated =
              candidatePool(
                pool
              );

            const currentCoverage =
              coverage(
                accumulated,
                context.cities
              );

            diagnostics
              .attempts
              .push({
                pageNumber,
                pageUrl,
                stage,

                result:
                  "usable-listing",

                structuralArticles,

                ...metadata,

                stageCandidateCount:
                  candidates.length,

                accumulatedCandidateCount:
                  accumulated.length,

                coverage:
                  currentCoverage,

                nextPagePreferredStage:
                  STAGES[
                    preferredStageIndex
                  ]
              });


            /*
             * If this page was structurally acquired but does
             * not contain the target, DO NOT run lower transports.
             * That is pagination, not acquisition failure.
             */
            if (
              !currentCoverage
                .complete
            ) {
              break;
            }


            const currentFingerprint =
              fingerprint(
                accumulated
              );

            if (
              currentFingerprint ===
                lastSelectionFingerprint &&
              !lastAiError
            ) {
              break;
            }


            const selection =
              await selectCandidates(
                context,
                accumulated
              );

            lastSelectionFingerprint =
              currentFingerprint;

            lastAiError =
              Boolean(
                selection.aiError
              );


            const selectionCoverage =
              selectedCoverage(
                selection.urls,
                accumulated,
                context.cities
              );


            diagnostics
              .attempts
              .push({
                pageNumber,
                pageUrl,

                stage:
                  `${stage}-workers-ai-selection`,

                candidateCount:
                  accumulated.length,

                selected:
                  selection.urls,

                aiError:
                  selection.aiError,

                coverage:
                  selectionCoverage,

                semantic:
                  selection.diagnostics
              });


            if (
              selection.urls.length &&
              selectionCoverage
                .complete
            ) {
              diagnostics.finalPool =
                accumulated.map(
                  candidate => ({
                    url:
                      candidate.url,

                    score:
                      candidate.score,

                    matchedCities:
                      candidate
                        .matchedCities,

                    stage:
                      candidate.stage,

                    pageUrl:
                      candidate.pageUrl,

                    text:
                      candidate.text
                        .slice(
                          0,
                          500
                        )
                  })
                );

              diagnostics.finalSelection = {
                selected:
                  selection.urls,

                coverage:
                  selectionCoverage,

                aiError:null
              };

              return {
                status:"ready",
                mode:"article",

                targets:
                  selection.urls,

                discoveredFromUrl:
                  pageUrl,

                discoveryMethod:
                  `${stage}-page-first-workers-ai`,

                diagnostics
              };
            }


            /*
             * AI uncertainty is not a transport failure.
             * Continue bounded pagination instead of burning
             * Browser Run fallbacks on the same page.
             */
            break;

          } catch(error) {
            diagnostics
              .attempts
              .push({
                pageNumber,
                pageUrl,
                stage,

                result:
                  "acquisition-failed",

                error:
                  errorMessage(
                    error
                  )
              });

            /*
             * TRUE fallback:
             * try next lower acquisition method on SAME page.
             */
            continue;
          }
        }


        if (!pageAcquired) {
          diagnostics
            .attempts
            .push({
              pageNumber,
              pageUrl,

              result:
                "page-unavailable-all-stages"
            });
        }
      }
    }

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Non-fatal cleanup.
      }
    }
  }


  const finalCandidates =
    candidatePool(
      pool
    );

  diagnostics.finalPool =
    finalCandidates.map(
      candidate => ({
        url:
          candidate.url,

        score:
          candidate.score,

        matchedCities:
          candidate
            .matchedCities,

        stage:
          candidate.stage,

        pageUrl:
          candidate.pageUrl,

        text:
          candidate.text
            .slice(
              0,
              500
            )
      })
    );


  const finalCoverage =
    coverage(
      finalCandidates,
      context.cities
    );


  /*
   * One final AI retry only if structural discovery actually
   * covers every target city. Never call AI on zero/partial
   * discovery.
   */
  if (
    finalCandidates.length &&
    finalCoverage.complete &&
    (
      fingerprint(
        finalCandidates
      ) !==
        lastSelectionFingerprint ||
      lastAiError
    )
  ) {
    const selection =
      await selectCandidates(
        context,
        finalCandidates
      );

    const selectionCoverage =
      selectedCoverage(
        selection.urls,
        finalCandidates,
        context.cities
      );

    diagnostics.finalSelection = {
      selected:
        selection.urls,

      aiError:
        selection.aiError,

      coverage:
        selectionCoverage,

      semantic:
        selection.diagnostics
    };

    if (
      selection.urls.length &&
      selectionCoverage.complete
    ) {
      return {
        status:"ready",
        mode:"article",

        targets:
          selection.urls,

        discoveredFromUrl:
          options
            .landingUrls[0] ??
          null,

        discoveryMethod:
          "page-first-final-workers-ai",

        diagnostics
      };
    }
  }


  diagnostics.successfulPages =
    successfulPages;

  diagnostics.finalCoverage =
    finalCoverage;


  return {
    status:
      successfulPages > 0
        ? "not-published"
        : "unavailable",

    mode:"article",
    targets:[],

    discoveredFromUrl:
      options
        .landingUrls[0] ??
      null,

    discoveryMethod:null,

    diagnostics
  };
}


function articleQuality(
  context:ExpertAcquireContext,
  html:string
) {
  const $ =
    load(html);

  $(
    "script,style,noscript,svg,canvas,iframe,nav,footer,form"
  ).remove();

  const roots = [
    "article",
    "main",
    "[role='main']",
    "body"
  ];

  let text="";

  for (const selector of roots) {
    const candidate =
      cleanExpertInlineText(
        $(selector)
          .text(),
        50000
      );

    if (
      candidate.length >
      text.length
    ) {
      text=candidate;
    }

    if (
      candidate.length >=
      500
    ) {
      text=candidate;
      break;
    }
  }

  const material =
    normalizeExpertSearchText(
      text
    );

  const matchedCities =
    context.cities.filter(
      city =>
        material.includes(
          normalizeExpertSearchText(
            city
          )
        )
    );

  const predictionHit =
    [
      "tahmin",
      "analiz",
      "banko",
      "favori",
      "rakip",
      "sürpriz",
      "ganyan",
      "altılı",
      "koşu",
      "yarış"
    ]
      .some(
        term =>
          material.includes(
            normalizeExpertSearchText(
              term
            )
          )
      );

  return {
    ok:
      text.length >= 200 &&
      matchedCities.length > 0 &&
      predictionHit,

    characters:
      text.length,

    matchedCities,
    predictionHit
  };
}


async function quickScrapeArticle(
  context:ExpertAcquireContext,
  selector:string
):Promise<AcquiredHtml> {
  const response =
    await context.env.BROWSER
      .quickAction(
        "scrape",
        {
          url:
            context.url,

          elements:[
            {
              selector:"body"
            }
          ],

          gotoOptions:{
            waitUntil:
              "domcontentloaded",

            timeout:
              ARTICLE_GOTO_TIMEOUT_MS
          },

          waitForSelector:{
            selector,

            timeout:
              ARTICLE_SELECTOR_TIMEOUT_MS
          },

          rejectResourceTypes:[
            "image",
            "media",
            "font"
          ]
        } as any
      );

  if (!response.ok) {
    throw new Error(
      `CF_SCRAPE_ARTICLE_HTTP_${response.status}`
    );
  }

  const body =
    findHtml(
      unwrap(
        await response.json()
      )
    );

  if (!body) {
    throw new Error(
      "CF_SCRAPE_ARTICLE_HTML_NOT_FOUND"
    );
  }

  const html =
    body
      .toLowerCase()
      .includes("<html")
        ? body
        : `<html><body>${body}</body></html>`;

  if (html.length < 500) {
    throw new Error(
      `CF_SCRAPE_ARTICLE_TOO_SMALL:${html.length}`
    );
  }

  return {
    stage:"cf-scrape",
    html,

    requestedUrl:
      context.url,

    finalUrl:null,

    status:
      response.status,

    contentType:
      "text/html",

    bodyLength:
      html.length
  };
}


export async function acquireResilientArticleHtml(
  context:ExpertAcquireContext,
  options:ResilientArticleAcquireOptions
):Promise<AcquiredHtml> {
  const failures:any[] =
    [];


  const withTrace = (
    acquired:AcquiredHtml,
    selectedStage:string,
    quality:any
  ):AcquiredHtml => {
    return {
      ...acquired,

      diagnostics:{
        traceVersion:
          "part5-article-acquisition-v2",

        architecture:
          "content>scrape>puppeteer:true-fallback",

        gotoWaitUntil:
          "domcontentloaded",

        selectedStage,

        readySelector:
          options.readySelector,

        quality,

        previousFailures:[
          ...failures
        ]
      }
    } as
      AcquiredHtml & {
        diagnostics:any
      };
  };


  /*
   * Article CONTENT
   */
  try {
    const acquired =
      await quickContent(
        context,
        context.url,
        options.readySelector,
        ARTICLE_GOTO_TIMEOUT_MS,
        ARTICLE_SELECTOR_TIMEOUT_MS
      );

    const quality =
      articleQuality(
        context,
        acquired.html
      );

    if (!quality.ok) {
      throw new Error(
        "CF_CONTENT_ARTICLE_QUALITY_FAILED:" +
        JSON.stringify(
          quality
        )
      );
    }

    return withTrace(
      {
        stage:"cf-content",

        html:
          acquired.html,

        requestedUrl:
          context.url,

        finalUrl:null,

        status:
          acquired.status,

        contentType:
          "text/html",

        bodyLength:
          acquired.html.length
      },
      "cf-content",
      quality
    );

  } catch(error) {
    failures.push({
      stage:"cf-content",

      error:
        errorMessage(
          error
        )
    });
  }


  /*
   * Article SCRAPE
   */
  try {
    const acquired =
      await quickScrapeArticle(
        context,
        options.readySelector
      );

    const quality =
      articleQuality(
        context,
        acquired.html
      );

    if (!quality.ok) {
      throw new Error(
        "CF_SCRAPE_ARTICLE_QUALITY_FAILED:" +
        JSON.stringify(
          quality
        )
      );
    }

    return withTrace(
      acquired,
      "cf-scrape",
      quality
    );

  } catch(error) {
    failures.push({
      stage:"cf-scrape",

      error:
        errorMessage(
          error
        )
    });
  }


  /*
   * Expensive last resort.
   * ONE browser instance, one article navigation.
   */
  let browser:any=null;

  try {
    browser =
      await puppeteer.launch(
        context.env.BROWSER
          as any
      );

    const page =
      await browser.newPage();

    await page.goto(
      context.url,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          ARTICLE_GOTO_TIMEOUT_MS
      }
    );

    await page.waitForSelector(
      options.readySelector,
      {
        timeout:
          ARTICLE_SELECTOR_TIMEOUT_MS
      }
    );

    const html =
      String(
        await page.content()
      );

    if (
      html.length <
      500
    ) {
      throw new Error(
        `PUPPETEER_ARTICLE_TOO_SMALL:${html.length}`
      );
    }

    const quality =
      articleQuality(
        context,
        html
      );

    if (!quality.ok) {
      throw new Error(
        "PUPPETEER_ARTICLE_QUALITY_FAILED:" +
        JSON.stringify(
          quality
        )
      );
    }

    return withTrace(
      {
        stage:"browser-session",
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
      },
      "browser-session",
      quality
    );

  } catch(error) {
    failures.push({
      stage:"browser-session",

      error:
        errorMessage(
          error
        )
    });

    throw new Error(
      "RESILIENT_ARTICLE_ACQUISITION_FAILED:" +
      JSON.stringify(
        failures
      )
    );

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Non-fatal cleanup.
      }
    }
  }
}
