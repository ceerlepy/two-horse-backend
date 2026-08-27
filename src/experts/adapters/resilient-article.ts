import puppeteer from "@cloudflare/puppeteer";
import { load } from "cheerio";
import type { AcquiredHtml } from "../../acquisition/types";
import { candidateEvidence } from "../discovery";
import { isAllowedDiscoveredArticleUrl } from "../source-policy";
import { cleanExpertInlineText, normalizeExpertSearchText } from "../text-normalization";
import { selectExpertCandidateUrlsWithWorkersAi } from "../workers-ai-discovery";
import type { ExpertAcquireContext, ExpertAdapterContext, ExpertTargetResolution } from "./types";

const GOTO_TIMEOUT_MS = 30_000;
const SELECTOR_TIMEOUT_MS = 20_000;

export interface ResilientArticleResolveOptions {
  landingUrls:string[];
  readySelector:string;
  maxPages?:number;
  urlPredicate?:(url:string)=>boolean;
}

export interface ResilientArticleAcquireOptions { readySelector:string; }

type RawAnchor = { href:string; text:string; identityText:string };
type Candidate = {
  url:string; text:string; score:number; matchedCities:string[];
  stage:string; pageUrl:string;
};

const err = (e:unknown) => e instanceof Error ? e.message : String(e);
const unwrap = (v:any) => v && typeof v === "object" && "result" in v ? v.result : v;

function findHtml(v:any):string|null {
  if (!v) return null;
  if (typeof v === "string" && v.length > 100) return v;
  if (typeof v === "object" && typeof v.html === "string" && v.html.length > 100) return v.html;
  if (Array.isArray(v)) {
    for (const x of v) { const hit=findHtml(x); if (hit) return hit; }
    return null;
  }
  if (typeof v === "object") {
    for (const x of Object.values(v)) { const hit=findHtml(x); if (hit) return hit; }
  }
  return null;
}

function pagedUrl(base:string,page:number):string {
  if (page <= 1) return base;
  const u=new URL(base);
  u.pathname=u.pathname.replace(/\/+$/g,"")+`/page/${page}/`;
  return u.toString();
}

function normalizeUrl(base:string,value:string):string|null {
  try {
    const u=new URL(value,base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash="";
    return u.toString();
  } catch { return null; }
}

function key(value:string):string {
  try { const u=new URL(value); u.hash=""; return u.toString(); }
  catch { return value; }
}

function anchorsFromHtml(html:string):RawAnchor[] {
  const $=load(html);
  $("script,style,noscript,svg,canvas,iframe").remove();
  const out:RawAnchor[]=[];
  $("a[href]").each((_i:number,el:any)=>{
    const a=$(el), href=a.attr("href");
    if (!href) return;
    const box=a.closest("article,.post,.entry,.card,.item,li").first();
    const anchorText=cleanExpertInlineText(a.text(),1000);
    const contextText=cleanExpertInlineText(box.length ? box.text() : anchorText,1800);
    out.push({
      href,
      text:[anchorText,contextText].filter(Boolean).join(" | "),
      identityText:contextText||anchorText
    });
  });
  return out;
}

function anchorsFromScrape(raw:any):RawAnchor[] {
  const payload=unwrap(raw), groups=Array.isArray(payload)?payload:[], out:RawAnchor[]=[];
  for (const group of groups) {
    const values=Array.isArray(group?.results)?group.results:[];
    for (const value of values) {
      const attrs=Array.isArray(value?.attributes)?value.attributes:[];
      const hrefAttr=attrs.find((a:any)=>String(a?.name??"").toLowerCase()==="href");
      const href=hrefAttr?.value ? String(hrefAttr.value) : "";
      if (!href) continue;
      const text=cleanExpertInlineText(String(value?.text??""),1200);
      out.push({href,text,identityText:text});
    }
  }
  return out;
}

function candidatesFromAnchors(
  context:ExpertAdapterContext,
  pageUrl:string,
  anchors:RawAnchor[],
  stage:string,
  predicate?:(url:string)=>boolean
):Candidate[] {
  const byUrl=new Map<string,Candidate>();

  for (const a of anchors) {
    const url=normalizeUrl(pageUrl,a.href);

    if (
      !url ||
      !isAllowedDiscoveredArticleUrl(context.source.source_key,url) ||
      (predicate && !predicate(url))
    ) continue;

    const e=candidateEvidence(
      context.source.source_key,
      url,
      a.text,
      context.raceDate,
      context.cities,
      a.identityText
    );

    if (
      !e.hasDate ||
      !e.hasCity ||
      !e.hasPredictionLanguage ||
      e.hasNegativeLanguage
    ) continue;

    const c:Candidate={
      url,
      text:a.text,
      score:e.score,
      matchedCities:e.matchedCities,
      stage,
      pageUrl
    };

    const old=byUrl.get(key(url));

    if (
      !old ||
      c.score>old.score ||
      (c.score===old.score && c.text.length>old.text.length)
    ) byUrl.set(key(url),c);
  }

  return [...byUrl.values()];
}

function merge(pool:Map<string,Candidate>,values:Candidate[]) {
  for (const c of values) {
    const k=key(c.url), old=pool.get(k);
    if (
      !old ||
      c.score>old.score ||
      (c.score===old.score && c.text.length>old.text.length)
    ) pool.set(k,c);
  }
}

const poolValues=(pool:Map<string,Candidate>)=>
  [...pool.values()]
    .sort((a,b)=>b.score-a.score)
    .slice(0,220);

function coverage(candidates:Candidate[],cities:string[]) {
  const found=new Set<string>();

  for (const c of candidates)
    for (const city of c.matchedCities)
      found.add(normalizeExpertSearchText(city));

  const matchedCities=cities.filter(
    city=>found.has(normalizeExpertSearchText(city))
  );

  const missingCities=cities.filter(
    city=>!found.has(normalizeExpertSearchText(city))
  );

  return {
    matchedCities,
    missingCities,
    complete:missingCities.length===0
  };
}

const fingerprint=(candidates:Candidate[])=>
  candidates.map(c=>`${c.url}|${c.score}|${c.text}`).join("\n");

async function quickContent(
  context:ExpertAdapterContext,
  url:string,
  selector:string
) {
  const r=await context.env.BROWSER.quickAction(
    "content",
    {
      url,
      gotoOptions:{
        waitUntil:"networkidle2",
        timeout:GOTO_TIMEOUT_MS
      },
      waitForSelector:{
        selector,
        timeout:SELECTOR_TIMEOUT_MS
      },
      rejectResourceTypes:[
        "image",
        "media",
        "font"
      ]
    } as any
  );

  if (!r.ok)
    throw new Error(`CF_CONTENT_READY_HTTP_${r.status}`);

  const raw:any=await r.json();
  const payload=unwrap(raw);

  const html=
    typeof payload === "string"
      ? payload
      : findHtml(payload);

  if (!html)
    throw new Error("CF_CONTENT_READY_HTML_NOT_FOUND");

  if (html.length<500)
    throw new Error(`CF_CONTENT_READY_TOO_SMALL:${html.length}`);

  return {
    html,
    status:r.status
  };
}

async function quickScrapeAnchors(
  context:ExpertAdapterContext,
  url:string,
  selector:string
) {
  const r=await context.env.BROWSER.quickAction(
    "scrape",
    {
      url,
      elements:[
        {
          selector:"a[href]"
        }
      ],
      gotoOptions:{
        waitUntil:"networkidle2",
        timeout:GOTO_TIMEOUT_MS
      },
      waitForSelector:{
        selector,
        timeout:SELECTOR_TIMEOUT_MS
      },
      rejectResourceTypes:[
        "image",
        "media",
        "font"
      ]
    } as any
  );

  if (!r.ok)
    throw new Error(`CF_SCRAPE_READY_HTTP_${r.status}`);

  const anchors=anchorsFromScrape(await r.json());

  if (!anchors.length)
    throw new Error("CF_SCRAPE_READY_ANCHORS_EMPTY");

  return {
    anchors,
    status:r.status
  };
}

function rawLinkValues(payload:unknown):unknown[] {
  if (Array.isArray(payload))
    return payload;

  if (payload && typeof payload === "object") {
    const links=(payload as {links?:unknown}).links;
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
  const r=await context.env.BROWSER.quickAction(
    "links",
    {
      url,
      excludeExternalLinks:true,
      gotoOptions:{
        waitUntil:"networkidle2",
        timeout:GOTO_TIMEOUT_MS
      },
      waitForSelector:{
        selector,
        timeout:SELECTOR_TIMEOUT_MS
      }
    } as any
  );

  if (!r.ok)
    throw new Error(`CF_LINKS_READY_HTTP_${r.status}`);

  const links=[
    ...new Set(
      rawLinkValues(unwrap(await r.json()))
        .map(v=>String(v).trim())
        .filter(Boolean)
    )
  ];

  if (!links.length)
    throw new Error("CF_LINKS_READY_EMPTY");

  return {
    links,
    status:r.status
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
      waitUntil:"networkidle2",
      timeout:GOTO_TIMEOUT_MS
    }
  );

  await page.waitForSelector(
    selector,
    {
      timeout:SELECTOR_TIMEOUT_MS
    }
  );

  const anchors=await page.evaluate(
    ()=>
      Array.from(
        document.querySelectorAll("a[href]")
      )
        .map(element=>{
          const a=element as HTMLAnchorElement;

          const box=
            a.closest(
              "article,.post,.entry,.card,.item,li"
            ) as HTMLElement|null;

          const anchorText=
            String(
              a.innerText ??
              a.textContent ??
              ""
            )
              .replace(/\s+/g," ")
              .trim()
              .slice(0,1000);

          const contextText=
            String(
              box?.innerText ??
              box?.textContent ??
              anchorText
            )
              .replace(/\s+/g," ")
              .trim()
              .slice(0,1800);

          return {
            href:String(a.href??""),
            text:[
              anchorText,
              contextText
            ]
              .filter(Boolean)
              .join(" | "),
            identityText:
              contextText ||
              anchorText
          };
        })
        .filter(v=>Boolean(v.href))
  );

  return {
    anchors:anchors as RawAnchor[],
    finalUrl:String(page.url())
  };
}

async function select(
  context:ExpertAdapterContext,
  candidates:Candidate[]
) {
  try {
    const semantic=
      await selectExpertCandidateUrlsWithWorkersAi(
        context.env,
        {
          sourceName:
            context.source.source_name,
          raceDate:
            context.raceDate,
          cities:
            context.cities,
          candidates:
            candidates.map(c=>({
              url:c.url,
              text:c.text,
              score:c.score
            }))
        }
      );

    const byKey=
      new Map(
        candidates.map(
          c=>[
            key(c.url),
            c.url
          ] as const
        )
      );

    const urls:string[]=[];

    for (const raw of semantic.urls) {
      const normalized=
        normalizeUrl(
          candidates[0]?.pageUrl ?? raw,
          raw
        );

      const allowed=
        normalized
          ? byKey.get(key(normalized))
          : null;

      if (
        allowed &&
        !urls.includes(allowed)
      ) urls.push(allowed);
    }

    return {
      urls,
      aiError:null as string|null,
      diagnostics:
        semantic.diagnostics
    };

  } catch (e) {
    return {
      urls:[] as string[],
      aiError:err(e),
      diagnostics:null
    };
  }
}

function selectedCoverage(
  urls:string[],
  candidates:Candidate[],
  cities:string[]
) {
  const wanted=
    new Set(
      urls.map(key)
    );

  return coverage(
    candidates.filter(
      c=>wanted.has(key(c.url))
    ),
    cities
  );
}

export async function resolveResilientArticleTargets(
  context:ExpertAdapterContext,
  options:ResilientArticleResolveOptions
):Promise<ExpertTargetResolution> {
  const maxPages=
    Math.max(
      1,
      Math.min(
        options.maxPages ?? 1,
        6
      )
    );

  const diagnostics:any={
    traceVersion:
      "part5-resilient-v1",
    architecture:
      "cf-content-ready>cf-scrape-ready>cf-links-ready>puppeteer",
    readySelector:
      options.readySelector,
    maxPages,
    attempts:[],
    finalPool:[],
    finalSelection:null
  };

  const pool=
    new Map<string,Candidate>();

  let successfulAcquisitions=0;
  let lastFingerprint="";
  let lastAiError=false;

  let browser:any=null;
  let page:any=null;

  const stages=[
    "cf-content",
    "cf-scrape",
    "cf-links",
    "puppeteer"
  ] as const;

  try {
    for (const stage of stages) {
      for (const landingUrl of options.landingUrls) {
        for (
          let pageNumber=1;
          pageNumber<=maxPages;
          pageNumber++
        ) {
          const pageUrl=
            pagedUrl(
              landingUrl,
              pageNumber
            );

          try {
            let candidates:Candidate[]=[];
            let metadata:any={};

            if (stage==="cf-content") {
              const a=
                await quickContent(
                  context,
                  pageUrl,
                  options.readySelector
                );

              const anchors=
                anchorsFromHtml(a.html);

              candidates=
                candidatesFromAnchors(
                  context,
                  pageUrl,
                  anchors,
                  stage,
                  options.urlPredicate
                );

              metadata={
                responseStatus:a.status,
                bodyLength:a.html.length,
                anchorCount:anchors.length
              };

            } else if (stage==="cf-scrape") {
              const a=
                await quickScrapeAnchors(
                  context,
                  pageUrl,
                  options.readySelector
                );

              candidates=
                candidatesFromAnchors(
                  context,
                  pageUrl,
                  a.anchors,
                  stage,
                  options.urlPredicate
                );

              metadata={
                responseStatus:a.status,
                anchorCount:a.anchors.length
              };

            } else if (stage==="cf-links") {
              const a=
                await quickLinks(
                  context,
                  pageUrl,
                  options.readySelector
                );

              candidates=
                candidatesFromAnchors(
                  context,
                  pageUrl,
                  a.links.map(
                    href=>({
                      href,
                      text:href,
                      identityText:href
                    })
                  ),
                  stage,
                  options.urlPredicate
                );

              metadata={
                responseStatus:a.status,
                linkCount:a.links.length
              };

            } else {
              if (!browser) {
                browser=
                  await puppeteer.launch(
                    context.env.BROWSER as any
                  );

                page=
                  await browser.newPage();
              }

              const a=
                await browserAnchors(
                  page,
                  pageUrl,
                  options.readySelector
                );

              candidates=
                candidatesFromAnchors(
                  context,
                  pageUrl,
                  a.anchors,
                  stage,
                  options.urlPredicate
                );

              metadata={
                finalUrl:a.finalUrl,
                anchorCount:a.anchors.length
              };
            }

            successfulAcquisitions++;

            merge(
              pool,
              candidates
            );

            const accumulated=
              poolValues(pool);

            const cov=
              coverage(
                accumulated,
                context.cities
              );

            diagnostics.attempts.push({
              stage,
              pageNumber,
              pageUrl,
              waitedForSelector:
                options.readySelector,
              ...metadata,
              stageCandidateCount:
                candidates.length,
              accumulatedCandidateCount:
                accumulated.length,
              coverage:cov
            });

            if (!cov.complete)
              continue;

            const fp=
              fingerprint(accumulated);

            if (
              fp===lastFingerprint &&
              !lastAiError
            ) continue;

            const s=
              await select(
                context,
                accumulated
              );

            lastFingerprint=fp;
            lastAiError=
              Boolean(s.aiError);

            const sc=
              selectedCoverage(
                s.urls,
                accumulated,
                context.cities
              );

            diagnostics.attempts.push({
              stage:
                `${stage}-workers-ai-selection`,
              pageNumber,
              pageUrl,
              candidateCount:
                accumulated.length,
              selected:s.urls,
              aiError:s.aiError,
              coverage:sc,
              semantic:s.diagnostics
            });

            if (
              s.urls.length &&
              sc.complete
            ) {
              diagnostics.finalPool=
                accumulated.map(c=>({
                  url:c.url,
                  score:c.score,
                  matchedCities:
                    c.matchedCities,
                  stage:c.stage,
                  pageUrl:c.pageUrl,
                  text:
                    c.text.slice(0,500)
                }));

              diagnostics.finalSelection={
                selected:s.urls,
                coverage:sc,
                aiError:null
              };

              return {
                status:"ready",
                mode:"article",
                targets:s.urls,
                discoveredFromUrl:
                  pageUrl,
                discoveryMethod:
                  "resilient-article-ladder-workers-ai",
                diagnostics
              };
            }

          } catch (e) {
            diagnostics.attempts.push({
              stage,
              pageNumber,
              pageUrl,
              waitedForSelector:
                options.readySelector,
              error:err(e)
            });
          }
        }
      }
    }

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // cleanup
      }
    }
  }

  const finalCandidates=
    poolValues(pool);

  diagnostics.finalPool=
    finalCandidates.map(c=>({
      url:c.url,
      score:c.score,
      matchedCities:
        c.matchedCities,
      stage:c.stage,
      pageUrl:c.pageUrl,
      text:
        c.text.slice(0,500)
    }));

  if (
    finalCandidates.length &&
    (
      fingerprint(finalCandidates)!==
        lastFingerprint ||
      lastAiError
    )
  ) {
    const s=
      await select(
        context,
        finalCandidates
      );

    const sc=
      selectedCoverage(
        s.urls,
        finalCandidates,
        context.cities
      );

    diagnostics.finalSelection={
      selected:s.urls,
      aiError:s.aiError,
      coverage:sc,
      semantic:s.diagnostics
    };

    if (
      s.urls.length &&
      sc.complete
    ) {
      return {
        status:"ready",
        mode:"article",
        targets:s.urls,
        discoveredFromUrl:
          options.landingUrls[0] ?? null,
        discoveryMethod:
          "resilient-article-ladder-final-workers-ai",
        diagnostics
      };
    }
  }

  diagnostics.successfulAcquisitions=
    successfulAcquisitions;

  return {
    status:
      successfulAcquisitions>0
        ? "not-published"
        : "unavailable",
    mode:"article",
    targets:[],
    discoveredFromUrl:
      options.landingUrls[0] ?? null,
    discoveryMethod:null,
    diagnostics
  };
}

async function scrapeArticle(
  context:ExpertAcquireContext,
  url:string,
  selector:string
):Promise<AcquiredHtml> {
  const r=
    await context.env.BROWSER.quickAction(
      "scrape",
      {
        url,
        elements:[
          {
            selector:"body"
          }
        ],
        gotoOptions:{
          waitUntil:"networkidle2",
          timeout:GOTO_TIMEOUT_MS
        },
        waitForSelector:{
          selector,
          timeout:SELECTOR_TIMEOUT_MS
        },
        rejectResourceTypes:[
          "image",
          "media",
          "font"
        ]
      } as any
    );

  if (!r.ok)
    throw new Error(
      `CF_SCRAPE_ARTICLE_HTTP_${r.status}`
    );

  const body=
    findHtml(
      unwrap(
        await r.json()
      )
    );

  if (!body)
    throw new Error(
      "CF_SCRAPE_ARTICLE_HTML_NOT_FOUND"
    );

  const html=
    body
      .toLowerCase()
      .includes("<html")
        ? body
        : `<html><body>${body}</body></html>`;

  if (html.length<500)
    throw new Error(
      `CF_SCRAPE_ARTICLE_TOO_SMALL:${html.length}`
    );

  return {
    stage:"cf-scrape",
    html,
    requestedUrl:url,
    finalUrl:null,
    status:r.status,
    contentType:"text/html",
    bodyLength:html.length
  };
}

export async function acquireResilientArticleHtml(
  context:ExpertAcquireContext,
  options:ResilientArticleAcquireOptions
):Promise<AcquiredHtml> {
  const failures:any[]=[];

  const traced=(
    a:AcquiredHtml,
    selectedStage:string
  ):AcquiredHtml=>({
    ...a,
    diagnostics:{
      traceVersion:
        "part5-article-acquisition-v1",
      architecture:
        "cf-content-ready>cf-scrape-ready>puppeteer",
      readySelector:
        options.readySelector,
      selectedStage,
      previousFailures:[
        ...failures
      ]
    }
  } as AcquiredHtml & {diagnostics:any});

  try {
    const a=
      await quickContent(
        context as any,
        context.url,
        options.readySelector
      );

    return traced(
      {
        stage:"cf-content",
        html:a.html,
        requestedUrl:
          context.url,
        finalUrl:null,
        status:a.status,
        contentType:"text/html",
        bodyLength:a.html.length
      },
      "cf-content"
    );

  } catch (e) {
    failures.push({
      stage:"cf-content",
      waitedForSelector:
        options.readySelector,
      error:err(e)
    });
  }

  try {
    return traced(
      await scrapeArticle(
        context,
        context.url,
        options.readySelector
      ),
      "cf-scrape"
    );

  } catch (e) {
    failures.push({
      stage:"cf-scrape",
      waitedForSelector:
        options.readySelector,
      error:err(e)
    });
  }

  let browser:any=null;

  try {
    browser=
      await puppeteer.launch(
        context.env.BROWSER as any
      );

    const page=
      await browser.newPage();

    await page.goto(
      context.url,
      {
        waitUntil:"networkidle2",
        timeout:GOTO_TIMEOUT_MS
      }
    );

    await page.waitForSelector(
      options.readySelector,
      {
        timeout:SELECTOR_TIMEOUT_MS
      }
    );

    const html=
      String(
        await page.content()
      );

    if (html.length<500)
      throw new Error(
        `BROWSER_ARTICLE_TOO_SMALL:${html.length}`
      );

    return traced(
      {
        stage:"browser-session",
        html,
        requestedUrl:
          context.url,
        finalUrl:
          String(page.url()),
        status:200,
        contentType:"text/html",
        bodyLength:html.length
      },
      "browser-session"
    );

  } catch (e) {
    failures.push({
      stage:"browser-session",
      waitedForSelector:
        options.readySelector,
      error:err(e)
    });

    throw new Error(
      "RESILIENT_ARTICLE_ACQUISITION_FAILED:"+
      JSON.stringify(failures)
    );

  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // cleanup
      }
    }
  }
}
