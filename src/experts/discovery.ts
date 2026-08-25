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
    string[]
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


  return {
    score,
    matchedCities,
    hasCity,
    hasDate,
    hasPredictionLanguage,
    hasNegativeLanguage,

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
    string[]
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
      cities
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


  const contextSelector =
    discovery
      .contextContainers
      .join(",");


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


      const context =
        anchor
          .closest(
            contextSelector
          )
          .first();


      const text =
        cleanExpertInlineText(
          [
            anchor.text(),
            context.text()
          ]
            .filter(Boolean)
            .join(" | "),

          discovery
            .candidateContextCharacters
        );


      const candidate =
        candidateFromEvidence(
          sourceKey,
          landingUrl,
          url,
          text,
          raceDate,
          cities
        );


      if (candidate) {
        output.push(
          candidate
        );
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
) {
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
) {
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


      let selection:any =
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


function directPageEvidence(
  sourceKey:
    string,

  html:
    string,

  cities:
    string[]
): boolean {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const $ =
    load(html);


  $("script,style,noscript,svg,iframe")
    .remove();


  const text =
    normalizeExpertSearchText(
      $("body").text()
    );


  if (
    text.length <
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .minimumTextCharacters
  ) {
    return false;
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
    return false;
  }


  if (
    !source
      .preflightRequiresCity
  ) {
    return true;
  }


  return cities.some(
    city =>
      text.includes(
        normalizeExpertSearchText(
          city
        )
      )
  );
}


async function probeDirectPage(
  env:
    Env,

  sourceKey:
    string,

  url:
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


      const usable =
        directPageEvidence(
          sourceKey,
          acquired.html,
          cities
        );


      diagnostics.stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        usable
      });


      if (usable) {
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

  cities:
    string[]
) {
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
) {
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
