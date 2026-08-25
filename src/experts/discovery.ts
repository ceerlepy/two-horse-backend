import {
  load
} from "cheerio";

import type {
  Env
} from "../env";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../config/expert-acquisition";

import type {
  ExpertDiscoveryStage,
  ExpertHtmlAcquisitionStage
} from "../config/expert-acquisition";

import {
  acquireExpertHtmlStage
} from "./acquisition-fallback";

import {
  acquireCfLinks
} from "../acquisition/cloudflare-links";

import {
  selectExpertCandidateUrlsWithWorkersAi
} from "./workers-ai-discovery";

import {
  buildExpertRaceDateTokens
} from "./date-evidence";

import {
  cleanExpertInlineText,
  normalizeExpertSearchText
} from "./text-normalization";

import {
  expertNavigationLabels,
  expertRootIsEditorial,
  isAllowedDiscoveredArticleUrl,
  isExcludedExpertUtilityPath,
  preferredArticlePathScore
} from "./source-policy";

import {
  turkeyDate
} from "../shared";


interface CandidateLink {
  url:
    string;

  text:
    string;

  score:
    number;

  matchedCities:
    string[];

  hasCity:
    boolean;

  hasDate:
    boolean;

  hasPredictionLanguage:
    boolean;

  hasNegativeLanguage:
    boolean;

  /*
   * Hard-filter result.
   *
   * "deterministic" is retained only for compatibility with
   * existing diagnostics/tests.
   *
   * It MUST NEVER directly select a final article URL.
   */
  deterministic:
    boolean;
}


interface CandidateCoverage {
  matchedCities:
    string[];

  missingCities:
    string[];

  complete:
    boolean;
}


interface StageCandidates {
  candidates:
    CandidateLink[];

  metadata:
    Record<string,unknown>;
}


interface TargetSelectionResult {
  urls:
    string[];

  aiError:
    string | null;

  diagnostics:
    Record<string,unknown>;
}


export interface ExpertArticleDiscoveryResult {
  urls:
    string[];

  method:
    string;

  diagnostics:
    any;
}


export interface DirectCurrentPageResolution {
  url:
    string | null;

  diagnostics:
    any;
}


function normalizedHost(
  value:
    string
): string | null {
  try {
    return new URL(value)
      .hostname
      .replace(/^www\./,"")
      .toLowerCase();

  } catch {
    return null;
  }
}


function sameHost(
  first:
    string,

  second:
    string
): boolean {
  const a =
    normalizedHost(first);

  const b =
    normalizedHost(second);


  return Boolean(
    a &&
    b &&
    a === b
  );
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
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }


    url.hash = "";


    return url.toString();

  } catch {
    return null;
  }
}


function sameUrl(
  first:
    string,

  second:
    string
): boolean {
  try {
    const a =
      new URL(first);

    const b =
      new URL(second);


    a.hash = "";
    b.hash = "";


    return (
      a.toString() ===
      b.toString()
    );

  } catch {
    return false;
  }
}


function isRootUrl(
  value:
    string
): boolean {
  try {
    const url =
      new URL(value);


    return (
      url.pathname === "/" &&
      !url.search
    );

  } catch {
    return false;
  }
}


function assetUrl(
  value:
    string
): boolean {
  try {
    const path =
      new URL(value)
        .pathname
        .toLowerCase();


    return EXPERT_ACQUISITION_CONFIG
      .discovery
      .assetExtensions
      .some(
        extension =>
          path.endsWith(
            extension
          )
      );

  } catch {
    return true;
  }
}


export function isUsableCandidate(
  landingUrl:
    string,

  value:
    string
): boolean {
  return (
    sameHost(
      landingUrl,
      value
    ) &&
    !sameUrl(
      landingUrl,
      value
    ) &&
    !assetUrl(value) &&
    !isRootUrl(value) &&
    !isExcludedExpertUtilityPath(
      value
    )
  );
}


function hasAnyTerm(
  material:
    string,

  values:
    string[]
): boolean {
  return values.some(
    value =>
      material.includes(
        normalizeExpertSearchText(
          value
        )
      )
  );
}


export function candidateEvidence(
  sourceKey:
    string,

  value:
    string,

  text:
    string,

  raceDate:
    string,

  cities:
    string[],

  hardNegativeText?:
    string
) {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const discovery =
    EXPERT_ACQUISITION_CONFIG
      .discovery;


  const material =
    normalizeExpertSearchText(
      `${value} ${text}`
    );


  /*
   * Positive discovery evidence may use nearby card/context
   * text, but hard-negative evidence must be identity-local.
   *
   * Otherwise unrelated sibling/sidebar text such as
   * "Kombine Bahis" or "AI Tahmin" can poison a valid
   * current article candidate.
   */
  const negativeMaterial =
    normalizeExpertSearchText(
      `${value} ${hardNegativeText ?? text}`
    );


  const matchedCities =
    cities.filter(
      city =>
        material.includes(
          normalizeExpertSearchText(
            city
          )
        )
    );


  const hasCity =
    matchedCities.length >
    0;


  /*
   * HARD DATE GATE.
   *
   * preferredPathScore can increase ranking.
   * It can never replace current-date evidence.
   */
  const hasDate =
    buildExpertRaceDateTokens(
      raceDate,
      {
        allowYearless:
          source
            .allowYearlessDateEvidence
      }
    )
      .some(
        token =>
          token &&
          material.includes(
            token
          )
      );


  const hasPredictionLanguage =
    hasAnyTerm(
      material,
      discovery.predictionTerms
    );


  const hasNegativeLanguage =
    hasAnyTerm(
      negativeMaterial,
      discovery.negativeTerms
    ) ||
    hasAnyTerm(
      negativeMaterial,
      source
        .excludedCandidateTerms
    );


  /*
   * Diagnostic only: tells us whether the broad card context
   * contained a negative term which was NOT part of the
   * candidate's own URL/title identity.
   */
  const contextHasNegativeLanguage =
    hasAnyTerm(
      material,
      discovery.negativeTerms
    ) ||
    hasAnyTerm(
      material,
      source
        .excludedCandidateTerms
    );


  const pathScore =
    preferredArticlePathScore(
      sourceKey,
      value
    );


  const contextBoost =
    source.contextBoostTerms
      .some(
        term =>
          material.includes(
            normalizeExpertSearchText(
              term
            )
          )
      )
      ? 4
      : 0;


  let score =
    pathScore +
    contextBoost;


  if (hasCity) {
    score += 5;
  }


  if (hasDate) {
    score += 5;
  }


  if (
    hasPredictionLanguage
  ) {
    score += 4;
  }


  if (
    hasNegativeLanguage
  ) {
    score -= 25;
  }


  const hardEligible =
    !hasNegativeLanguage &&
    hasDate &&
    hasCity &&
    hasPredictionLanguage &&
    score >=
      discovery
        .candidateMinScore;


  const rejectedReason =
    hasNegativeLanguage
      ? "negative-language"

      : !hasDate
        ? "missing-date"

        : !hasCity
          ? "missing-city"

          : !hasPredictionLanguage
            ? "missing-prediction-language"

            : null;


  return {
    score,
    matchedCities,
    hasCity,
    hasDate,
    hasPredictionLanguage,
    hasNegativeLanguage,
    contextHasNegativeLanguage,
    rejectedReason,

    /*
     * Compatibility diagnostic only.
     *
     * NEVER used as a final URL selector.
     */
    deterministic:
      hardEligible &&
      score >=
        discovery
          .deterministicMinScore
  };
}


function candidateFromEvidence(
  sourceKey:
    string,

  landingUrl:
    string,

  url:
    string,

  text:
    string,

  raceDate:
    string,

  cities:
    string[],

  hardNegativeText?:
    string
): CandidateLink | null {
  if (
    !isUsableCandidate(
      landingUrl,
      url
    ) ||
    !isAllowedDiscoveredArticleUrl(
      sourceKey,
      url
    )
  ) {
    return null;
  }


  const evidence =
    candidateEvidence(
      sourceKey,
      url,
      text,
      raceDate,
      cities,
      hardNegativeText
    );


  if (
    !evidence.hasDate ||
    !evidence.hasCity ||
    !evidence.hasPredictionLanguage ||
    evidence.hasNegativeLanguage
  ) {
    return null;
  }


  return {
    url,
    text,
    ...evidence
  };
}


function boundedCandidateContexts(
  anchor:
    any,

  maxCharacters:
    number
): string[] {
  const output:
    string[] = [];


  const add =
    (
      value:
        unknown
    ) => {
      const text =
        cleanExpertInlineText(
          value,
          maxCharacters
        );


      if (
        text &&
        !output.includes(
          text
        )
      ) {
        output.push(
          text
        );
      }
    };


  /*
   * Prefer semantic/card containers.
   *
   * Critical difference from:
   *
   * anchor.closest("article,...,div")
   *
   * A tiny inner <div> must not hide the publication date
   * stored on the real article/card parent.
   */
  const semantic =
    anchor
      .closest(
        [
          "article",
          ".post",
          ".entry",
          ".card",
          ".item",
          "li",
          "section"
        ].join(",")
      )
      .first();


  if (
    semantic.length
  ) {
    add(
      semantic.text()
    );
  }


  /*
   * Bounded parent walk for sites without semantic classes.
   * Stop before whole-page context becomes candidate evidence.
   */
  let cursor =
    anchor.parent();


  for (
    let depth=0;
    depth<7 &&
    cursor.length;
    depth++
  ) {
    const raw =
      String(
        cursor.text() ??
        ""
      )
        .replace(
          /\s+/g,
          " "
        )
        .trim();


    if (
      raw.length >
      maxCharacters *
        8
    ) {
      break;
    }


    if (
      raw.length <=
      maxCharacters *
        3
    ) {
      add(
        raw
      );
    }


    cursor =
      cursor.parent();
  }


  return output;
}


function candidatesFromHtml(
  sourceKey:
    string,

  landingUrl:
    string,

  html:
    string,

  raceDate:
    string,

  cities:
    string[]
): CandidateLink[] {
  const discovery =
    EXPERT_ACQUISITION_CONFIG
      .discovery;


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


  const output:
    CandidateLink[] = [];


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


      if (!href) {
        return;
      }


      const url =
        normalizeUrl(
          landingUrl,
          href
        );


      if (!url) {
        return;
      }


      const anchorText =
        cleanExpertInlineText(
          anchor.text(),

          discovery
            .candidateContextCharacters
        );


      const contexts =
        boundedCandidateContexts(
          anchor,

          discovery
            .candidateContextCharacters
        );


      /*
       * First try identity-only evidence. URLs such as
       * /25-agustos-kocaeli-at-yarisi-tahminleri/
       * can already be sufficient.
       */
      const materials =
        [
          anchorText,
          ...contexts.map(
            context =>
              cleanExpertInlineText(
                [
                  anchorText,
                  context
                ]
                  .filter(Boolean)
                  .join(" | "),

                discovery
                  .candidateContextCharacters
              )
          )
        ];


      for (
        const material of
        materials
      ) {
        const candidate =
          candidateFromEvidence(
            sourceKey,
            landingUrl,
            url,
            material,
            raceDate,
            cities,

            /*
             * Hard-negative evidence stays identity-local.
             */
            anchorText
          );


        if (candidate) {
          output.push(
            candidate
          );

          break;
        }
      }
    }
  );


  return dedupeCandidates(
    output
  );
}


function candidatesFromUrls(
  sourceKey:
    string,

  landingUrl:
    string,

  values:
    string[],

  raceDate:
    string,

  cities:
    string[]
): CandidateLink[] {
  const output:
    CandidateLink[] = [];


  for (const value of values) {
    const url =
      normalizeUrl(
        landingUrl,
        value
      );


    if (!url) {
      continue;
    }


    /*
     * /links has URL identity but not rich anchor/card text.
     * The URL itself therefore supplies available evidence.
     */
    const candidate =
      candidateFromEvidence(
        sourceKey,
        landingUrl,
        url,
        url,
        raceDate,
        cities
      );


    if (candidate) {
      output.push(
        candidate
      );
    }
  }


  return dedupeCandidates(
    output
  );
}


function dedupeCandidates(
  values:
    CandidateLink[]
): CandidateLink[] {
  const map =
    new Map<
      string,
      CandidateLink
    >();


  for (const candidate of values) {
    const previous =
      map.get(
        candidate.url
      );


    if (
      !previous ||
      candidate.score >
        previous.score ||
      (
        candidate.score ===
          previous.score &&
        candidate.text.length >
          previous.text.length
      )
    ) {
      map.set(
        candidate.url,
        candidate
      );
    }
  }


  return [
    ...map.values()
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
      EXPERT_ACQUISITION_CONFIG
        .discovery
        .maxCandidates
    );
}


function mergeCandidatePool(
  pool:
    Map<string,CandidateLink>,

  candidates:
    CandidateLink[]
): void {
  for (const candidate of candidates) {
    const previous =
      pool.get(
        candidate.url
      );


    if (
      !previous ||
      candidate.score >
        previous.score ||
      (
        candidate.score ===
          previous.score &&
        candidate.text.length >
          previous.text.length
      )
    ) {
      pool.set(
        candidate.url,
        candidate
      );
    }
  }
}


function candidatePoolValues(
  pool:
    Map<string,CandidateLink>
): CandidateLink[] {
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
      EXPERT_ACQUISITION_CONFIG
        .discovery
        .maxCandidates
    );
}


function candidateCoverage(
  candidates:
    CandidateLink[],

  cities:
    string[]
): CandidateCoverage {
  const normalizedMatched =
    new Set<string>();


  for (const candidate of candidates) {
    for (
      const city of
      candidate.matchedCities
    ) {
      normalizedMatched.add(
        normalizeExpertSearchText(
          city
        )
      );
    }
  }


  const matchedCities =
    cities.filter(
      city =>
        normalizedMatched.has(
          normalizeExpertSearchText(
            city
          )
        )
    );


  const missingCities =
    cities.filter(
      city =>
        !normalizedMatched.has(
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


function candidateFingerprint(
  candidates:
    CandidateLink[]
): string {
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


function normalizeSelectedUrls(
  landingUrl:
    string,

  values:
    unknown
): string[] {
  if (
    !Array.isArray(values)
  ) {
    return [];
  }


  return [
    ...new Set(
      values
        .map(
          value =>
            normalizeUrl(
              landingUrl,
              String(value)
            )
        )
        .filter(
          (
            value
          ): value is string =>
            Boolean(value)
        )
        .filter(
          value =>
            sameHost(
              landingUrl,
              value
            )
        )
    )
  ];
}


async function selectCurrentTargets(
  env:
    Env,

  sourceKey:
    string,

  sourceName:
    string,

  landingUrl:
    string,

  raceDate:
    string,

  cities:
    string[],

  candidates:
    CandidateLink[]
): Promise<TargetSelectionResult> {
  try {
    const semantic =
      await selectExpertCandidateUrlsWithWorkersAi(
        env,
        {
          sourceName,
          raceDate,
          cities,

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


    const candidateSet =
      new Set(
        candidates.map(
          candidate =>
            candidate.url
        )
      );


    const selected =
      normalizeSelectedUrls(
        landingUrl,
        semantic.urls
      )
        .filter(
          url =>
            candidateSet.has(
              url
            )
        )
        .filter(
          url =>
            isAllowedDiscoveredArticleUrl(
              sourceKey,
              url
            )
        );


    return {
      urls:
        selected,

      aiError:
        null as string | null,

      diagnostics: {
        candidateCount:
          candidates.length,

        selected,

        semantic:
          semantic.diagnostics
      }
    };

  } catch(error) {
    return {
      urls:[],

      aiError:
        error instanceof Error
          ? error.message
          : String(error),

      diagnostics: {
        candidateCount:
          candidates.length,

        selected:[],

        aiError:
          error instanceof Error
            ? error.message
            : String(error)
      }
    };
  }
}


async function acquireDiscoveryStageCandidates(
  env:
    Env,

  sourceKey:
    string,

  landingUrl:
    string,

  raceDate:
    string,

  cities:
    string[],

  stage:
    ExpertDiscoveryStage
): Promise<StageCandidates> {
  if (
    stage ===
    "cf-links"
  ) {
    const acquired =
      await acquireCfLinks(
        env,
        landingUrl
      );


    return {
      candidates:
        candidatesFromUrls(
          sourceKey,
          landingUrl,
          acquired.links,
          raceDate,
          cities
        ),

      metadata: {
        linkCount:
          acquired.links.length
      }
    };
  }


  const acquired =
    await acquireExpertHtmlStage(
      env,
      landingUrl,
      stage
    );


  return {
    candidates:
      candidatesFromHtml(
        sourceKey,
        landingUrl,
        acquired.html,
        raceDate,
        cities
      ),

    metadata: {
      bodyLength:
        acquired.bodyLength
    }
  };
}


async function discoverFromLanding(
  env:
    Env,

  sourceKey:
    string,

  sourceName:
    string,

  landingUrl:
    string,

  raceDate:
    string,

  cities:
    string[]
): Promise<ExpertArticleDiscoveryResult> {
  const stages =
    EXPERT_ACQUISITION_CONFIG
      .discovery
      .acquisitionOrder;


  const pool =
    new Map<
      string,
      CandidateLink
    >();


  const diagnostics:any = {
    stages:[]
  };


  let lastSelectionFingerprint =
    "";

  let lastSelectionHadError =
    false;


  for (
    let index=0;
    index<stages.length;
    index++
  ) {
    const stage =
      stages[index];


    const isLastStage =
      index ===
      stages.length - 1;


    try {
      const acquired =
        await acquireDiscoveryStageCandidates(
          env,
          sourceKey,
          landingUrl,
          raceDate,
          cities,
          stage
        );


      mergeCandidatePool(
        pool,
        acquired.candidates
      );


      const candidates =
        candidatePoolValues(
          pool
        );


      const coverage =
        candidateCoverage(
          candidates,
          cities
        );


      const fingerprint =
        candidateFingerprint(
          candidates
        );


      /*
       * Selection is attempted when:
       *
       * 1. structural acquisition now covers every target
       *    TJK city, OR
       *
       * 2. this is the final acquisition fallback.
       *
       * If AI returns [] or errors, discovery continues to
       * the next structural fallback.
       */
      const shouldSelect =
        candidates.length >
          0 &&
        (
          coverage.complete ||
          isLastStage
        ) &&
        (
          fingerprint !==
            lastSelectionFingerprint ||
          lastSelectionHadError
        );


      let selection:
        TargetSelectionResult | null =
        null;


      if (shouldSelect) {
        selection =
          await selectCurrentTargets(
            env,
            sourceKey,
            sourceName,
            landingUrl,
            raceDate,
            cities,
            candidates
          );


        lastSelectionFingerprint =
          fingerprint;


        lastSelectionHadError =
          Boolean(
            selection.aiError
          );
      }


      diagnostics.stages.push({
        stage,
        ...acquired.metadata,

        stageCandidateCount:
          acquired.candidates.length,

        accumulatedCandidateCount:
          candidates.length,

        coverage,

        selectionAttempted:
          shouldSelect,

        aiSelected:
          selection?.urls ??
          [],

        aiError:
          selection?.aiError ??
          null
      });


      /*
       * FINAL URL decision is AI-only.
       *
       * Local scoring / "deterministic" flags are never
       * unioned back into this result.
       */
      if (
        selection?.urls?.length
      ) {
        return {
          urls:
            selection.urls,

          method:
            `${stage}-workers-ai-candidate-selection`,

          diagnostics
        };
      }

    } catch(error) {
      diagnostics.stages.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  /*
   * Last transport may fail even though earlier structural
   * stages already produced usable candidates.
   *
   * Never discard that accumulated pool.
   */
  const finalCandidates =
    candidatePoolValues(
      pool
    );


  const finalFingerprint =
    candidateFingerprint(
      finalCandidates
    );


  const shouldFinalize =
    finalCandidates.length > 0 &&
    (
      finalFingerprint !==
        lastSelectionFingerprint ||
      lastSelectionHadError
    );


  diagnostics.finalPoolSelection = {
    candidateCount:
      finalCandidates.length,

    attempted:
      shouldFinalize,

    selected:[],
    aiError:null
  };


  if (shouldFinalize) {
    const finalSelection =
      await selectCurrentTargets(
        env,
        sourceKey,
        sourceName,
        landingUrl,
        raceDate,
        cities,
        finalCandidates
      );


    diagnostics.finalPoolSelection = {
      candidateCount:
        finalCandidates.length,

      attempted:true,

      selected:
        finalSelection.urls,

      aiError:
        finalSelection.aiError
    };


    if (
      finalSelection.urls.length
    ) {
      return {
        urls:
          finalSelection.urls,

        method:
          "final-pool-workers-ai-candidate-selection",

        diagnostics
      };
    }
  }


  return {
    urls:[],

    method:
      "progressive-discovery-empty",

    diagnostics
  };
}


function navigationTargetFromHtml(
  rootUrl:
    string,

  sourceKey:
    string,

  html:
    string
): string | null {
  const wanted =
    expertNavigationLabels(
      sourceKey
    )
      .map(
        normalizeExpertSearchText
      );


  if (!wanted.length) {
    return null;
  }


  const $ =
    load(html);


  let winnerUrl:
    string | null =
      null;


  let winnerScore =
    0;


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


      if (!href) {
        return;
      }


      const url =
        normalizeUrl(
          rootUrl,
          href
        );


      if (
        !url ||
        !sameHost(
          rootUrl,
          url
        ) ||
        isRootUrl(url)
      ) {
        return;
      }


      const text =
        normalizeExpertSearchText(
          anchor.text()
        );


      let score =
        0;


      for (const label of wanted) {
        if (
          text === label
        ) {
          score =
            Math.max(
              score,
              20
            );

        } else if (
          label &&
          text.includes(
            label
          )
        ) {
          score =
            Math.max(
              score,
              12
            );
        }
      }


      if (
        score >
        winnerScore
      ) {
        winnerUrl =
          url;

        winnerScore =
          score;
      }
    }
  );


  return winnerUrl;
}


async function recoverLandingFromRoot(
  env:
    Env,

  sourceKey:
    string,

  rootUrl:
    string
) {
  const diagnostics:any = {
    stages:[]
  };


  /*
   * Navigation recovery needs anchor text/HTML.
   * /links alone cannot provide semantic nav labels.
   */
  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          rootUrl,
          stage
        );


      const recovered =
        navigationTargetFromHtml(
          rootUrl,
          sourceKey,
          acquired.html
        );


      diagnostics.stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        recovered
      });


      if (recovered) {
        return {
          url:
            recovered,

          diagnostics
        };
      }

    } catch(error) {
      diagnostics.stages.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    url:null,
    diagnostics
  };
}


export function directPageDateEvidence(
  sourceKey:
    string,

  rawText:
    string,

  raceDate:
    string,

  cities:
    string[]
) {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const policy =
    source
      .directPageDatePolicy ??
    "none";


  if (
    policy ===
    "none"
  ) {
    return {
      ok:true,
      policy,
      reason:null
    };
  }


  const headCharacters =
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .directPageDateEvidenceCharacters;


  const text =
    normalizeExpertSearchText(
      rawText.slice(
        0,
        headCharacters
      )
    );


  if (
    policy ===
    "target-date"
  ) {
    const hit =
      buildExpertRaceDateTokens(
        raceDate,
        {
          allowYearless:
            source
              .allowYearlessDateEvidence
        }
      ).some(
        token =>
          token &&
          text.includes(
            token
          )
      );


    return {
      ok:hit,
      policy,

      reason:
        hit
          ? null
          : "TARGET_DATE_NOT_FOUND"
    };
  }


  /*
   * Publication date alone is not enough.
   *
   * Example:
   * 26 AĞUSTOS İSTANBUL TAHMİNLERİ
   * 25.08.2026   <-- publication date
   *
   * For target 25 August this must fail.
   */
  const dateTokens =
    buildExpertRaceDateTokens(
      raceDate,
      {
        allowYearless:true
      }
    ).filter(
      token =>
        /[a-z]/i.test(
          token
        )
    );


  const targetCities =
    cities.map(
      normalizeExpertSearchText
    );


  const predictionTerms =
    [
      "tahmin",
      "altılı",
      "ganyan"
    ].map(
      normalizeExpertSearchText
    );


  for (const token of dateTokens) {
    let from=0;

    while (
      from <
      text.length
    ) {
      const index =
        text.indexOf(
          token,
          from
        );


      if (
        index < 0
      ) {
        break;
      }


      const window =
        text.slice(
          Math.max(
            0,
            index - 80
          ),
          Math.min(
            text.length,
            index + 280
          )
        );


      const cityHit =
        targetCities.some(
          city =>
            window.includes(
              city
            )
        );


      const predictionHit =
        predictionTerms.some(
          term =>
            window.includes(
              term
            )
        );


      if (
        cityHit &&
        predictionHit
      ) {
        return {
          ok:true,
          policy,
          reason:null
        };
      }


      from =
        index +
        Math.max(
          token.length,
          1
        );
    }
  }


  return {
    ok:false,
    policy,

    reason:
      "TARGET_CITY_DATE_HEADING_NOT_FOUND"
  };
}


function directPageEvidence(
  sourceKey:
    string,

  html:
    string,

  raceDate:
    string,

  cities:
    string[]
) {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const $ =
    load(html);


  $("script,style,noscript,svg,iframe")
    .remove();


  const rawText =
    $("body").text();


  const text =
    normalizeExpertSearchText(
      rawText
    );


  const dateEvidence =
    directPageDateEvidence(
      sourceKey,
      rawText,
      raceDate,
      cities
    );


  if (
    text.length <
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .minimumTextCharacters
  ) {
    return {
      usable:false,
      reason:"TEXT_TOO_SMALL",
      dateEvidence
    };
  }


  const racing =
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .relevanceTerms
      .some(
        term =>
          text.includes(
            normalizeExpertSearchText(
              term
            )
          )
      );


  if (!racing) {
    return {
      usable:false,
      reason:
        "NO_EXPERT_RACING_EVIDENCE",
      dateEvidence
    };
  }


  if (!dateEvidence.ok) {
    return {
      usable:false,
      reason:
        dateEvidence.reason,
      dateEvidence
    };
  }


  if (
    !source
      .preflightRequiresCity
  ) {
    return {
      usable:true,
      reason:null,
      dateEvidence
    };
  }


  const cityHit =
    cities.some(
      city =>
        text.includes(
          normalizeExpertSearchText(
            city
          )
        )
    );


  return {
    usable:
      cityHit,

    reason:
      cityHit
        ? null
        : "NO_TARGET_CITY_EVIDENCE",

    dateEvidence
  };
}


async function probeDirectPage(
  env:
    Env,

  sourceKey:
    string,

  url:
    string,

  raceDate:
    string,

  cities:
    string[]
) {
  const diagnostics:any = {
    stages:[]
  };


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          url,
          stage
        );


      const evidence =
        directPageEvidence(
          sourceKey,
          acquired.html,
          raceDate,
          cities
        );


      diagnostics.stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        usable:
          evidence.usable,

        reason:
          evidence.reason,

        dateEvidence:
          evidence.dateEvidence
      });


      if (
        evidence.usable
      ) {
        return {
          ok:true,
          diagnostics
        };
      }

    } catch(error) {
      diagnostics.stages.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    ok:false,
    diagnostics
  };
}


export async function resolveDirectCurrentPageUrl(
  env:
    Env,

  sourceKey:
    string,

  entryUrls:
    string[],

  rootUrl:
    string | null,

  raceDate:
    string,

  cities:
    string[]
): Promise<DirectCurrentPageResolution> {
  const diagnostics:any = {
    directAttempts:[],
    rootRecovery:null
  };


  const primary =
    entryUrls.filter(
      url =>
        !rootUrl ||
        !sameUrl(
          url,
          rootUrl
        )
    );


  for (const url of primary) {
    const result =
      await probeDirectPage(
        env,
        sourceKey,
        url,
        raceDate,
        cities
      );


    diagnostics.directAttempts.push({
      url,
      ...result
    });


    if (result.ok) {
      return {
        url,
        diagnostics
      };
    }
  }


  /*
   * Known direct-current-page path moved:
   *
   * root is used only to rediscover its navigation target.
   */
  if (rootUrl) {
    const recovery =
      await recoverLandingFromRoot(
        env,
        sourceKey,
        rootUrl
      );


    diagnostics.rootRecovery =
      recovery;


    if (recovery.url) {
      const probe =
        await probeDirectPage(
          env,
          sourceKey,
          recovery.url,
          raceDate,
          cities
        );


      diagnostics.recoveredProbe = {
        url:
          recovery.url,

        ...probe
      };


      if (probe.ok) {
        return {
          url:
            recovery.url,

          diagnostics
        };
      }
    }
  }


  return {
    url:null,
    diagnostics
  };
}


export async function discoverExpertArticleUrls(
  env:
    Env,

  landingUrl:
    string,

  sourceName:
    string,

  cities:
    string[],

  sourceKey =
    "",

  raceDateOverride?:
    string
): Promise<ExpertArticleDiscoveryResult> {
  const raceDate =
    raceDateOverride ??
    turkeyDate();


  /*
   * Root is not the normal first discovery step for sources
   * whose root is only navigation.
   *
   * Try navigation recovery first.
   */
  if (
    isRootUrl(
      landingUrl
    ) &&
    !expertRootIsEditorial(
      sourceKey
    )
  ) {
    const recovery =
      await recoverLandingFromRoot(
        env,
        sourceKey,
        landingUrl
      );


    if (
      recovery.url &&
      !sameUrl(
        recovery.url,
        landingUrl
      )
    ) {
      const discovered =
        await discoverFromLanding(
          env,
          sourceKey,
          sourceName,
          recovery.url,
          raceDate,
          cities
        );


      if (
        discovered.urls.length
      ) {
        return {
          ...discovered,

          method:
            `root-nav-recovery:${discovered.method}`,

          diagnostics: {
            rootRecovery:
              recovery,

            recoveredLanding:
              recovery.url,

            discovery:
              discovered.diagnostics
          }
        };
      }
    }


    /*
     * If navigation moved too, root may still contain real
     * current article links.
     *
     * The same hard date/city/source filtering and Workers AI
     * final selection is used.
     */
    const rootFallback =
      await discoverFromLanding(
        env,
        sourceKey,
        sourceName,
        landingUrl,
        raceDate,
        cities
      );


    return {
      ...rootFallback,

      diagnostics: {
        rootRecovery:
          recovery,

        rootFallback:
          rootFallback.diagnostics
      }
    };
  }


  return discoverFromLanding(
    env,
    sourceKey,
    sourceName,
    landingUrl,
    raceDate,
    cities
  );
}
