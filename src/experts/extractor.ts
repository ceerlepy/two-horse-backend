import type {
  Env
} from "../env";

import type {
  ExpertExtractionInput
} from "../types/models";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../config/expert-acquisition";

import {
  turkeyDate
} from "../shared";

import {
  acquireExpertHtmlStage
} from "./acquisition-fallback";

import {
  expertArticleTextFromHtml
} from "./article-text";

import {
  normalizeExpertSearchText
} from "./text-normalization";

import {
  mapRawExpertExtraction
} from "./raw-extraction";

import type {
  RawExpertExtraction
} from "./raw-extraction";

import {
  expertExtractionPrompt
} from "./prompt";

import {
  extractExpertJsonWithWorkersAi
} from "./workers-ai-extraction";

import {
  inspectLiderformCompleteness,
  isLiderformSourceName
} from "./liderform-completeness";

import {
  explicitCouponExpectedSelections,
  explicitCouponExpectationPrompt,
  inspectExplicitCouponCompleteness,
  backfillExplicitCouponAnchors
} from "./coupon-completeness";

import {
  filterRawToExplicitAnchors
} from "./explicit-anchor-filter";

import {
  sanitizeRawAgainstCanonical
} from "./canonical-raw-sanitizer";

import {
  expertAdapterFor
} from "./adapters/registry";

import {
  targetCitiesForUrl
} from "./adapters/target-scope";

import {
  inspectAfaCompleteness
} from "./afa-completeness";


export interface ExtractedExperts {
  extraction:
    ExpertExtractionInput;

  status:
    | "success"
    | "semantic-empty";

  method:
    string;

  diagnostics:
    unknown;
}


function errorMessage(
  error:
    unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function preflight(
  sourceKey:
    string,

  text:
    string,

  cities:
    string[]
) {
  const extraction =
    EXPERT_ACQUISITION_CONFIG
      .extraction;


  if (
    text.length <
    extraction
      .minimumTextCharacters
  ) {
    return {
      ok:false,

      reason:
        `TEXT_TOO_SMALL:${text.length}`
    };
  }


  const normalized =
    normalizeExpertSearchText(
      text
    );


  const source =
    expertSourceConfig(
      sourceKey
    );


  const racing =
    extraction
      .relevanceTerms
      .some(
        term =>
          normalized.includes(
            normalizeExpertSearchText(
              term
            )
          )
      );


  const accessDeniedHits =
    (
      source.accessDeniedTerms ??
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
    accessDeniedHits.find(
      term =>
        normalizeExpertSearchText(
          term
        ) ===
        "vip uye ol"
    ) ??
    null;


  const strongAccessDeniedTerm =
    accessDeniedHits.find(
      term =>
        normalizeExpertSearchText(
          term
        ) !==
        "vip uye ol"
    ) ??
    null;


  const substantiveSelectionEvidence =
    text.length >=
      800 &&
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
      .length >=
      2;


  const accessDeniedTerm =
    strongAccessDeniedTerm ??
    (
      weakVipTerm &&
      !substantiveSelectionEvidence
        ? weakVipTerm
        : null
    );


  if (accessDeniedTerm) {
    return {
      ok:false,

      reason:
        `ACCESS_RESTRICTED:${accessDeniedTerm}`
    };
  }


  if (!racing) {
    return {
      ok:false,

      reason:
        "NO_EXPERT_RACING_EVIDENCE"
    };
  }


  if (
    !source
      .preflightRequiresCity
  ) {
    return {
      ok:true,
      reason:null
    };
  }


  const cityHit =
    cities.some(
      city =>
        normalized.includes(
          normalizeExpertSearchText(
            city
          )
        )
    );


  return cityHit
    ? {
        ok:true,
        reason:null
      }
    : {
        ok:false,
        reason:
          "NO_TARGET_CITY_EVIDENCE"
      };
}


function compactText(
  text:
    string,

  cities:
    string[]
) {
  const extraction =
    EXPERT_ACQUISITION_CONFIG
      .extraction;


  if (
    text.length <=
    extraction
      .semanticMaxCharacters
  ) {
    return {
      text,
      compacted:false
    };
  }


  const lines =
    text
      .split(/\n+/)
      .map(
        value =>
          value.trim()
      )
      .filter(Boolean);


  const important =
    new Set<number>();


  const normalizedCities =
    cities.map(
      normalizeExpertSearchText
    );


  for (
    let index=0;
    index<lines.length;
    index++
  ) {
    const normalized =
      normalizeExpertSearchText(
        lines[index]
      );


    const relevant =
      normalizedCities.some(
        city =>
          normalized.includes(
            city
          )
      ) ||
      extraction
        .relevanceTerms
        .some(
          term =>
            normalized.includes(
              normalizeExpertSearchText(
                term
              )
            )
        );


    if (!relevant) {
      continue;
    }


    const window =
      extraction
        .relevanceWindowLines;


    for (
      let offset=-window;
      offset<=window;
      offset++
    ) {
      const target =
        index + offset;


      if (
        target >= 0 &&
        target <
          lines.length
      ) {
        important.add(
          target
        );
      }
    }
  }


  const compacted =
    [
      ...important
    ]
      .sort(
        (
          first,
          second
        ) =>
          first-second
      )
      .map(
        index =>
          lines[index]
      )
      .join("\n");


  if (
    compacted.length >=
    800
  ) {
    return {
      text:
        compacted.slice(
          0,
          extraction
            .semanticMaxCharacters
        ),

      compacted:true
    };
  }


  const max =
    extraction
      .semanticMaxCharacters;


  const head =
    Math.floor(
      max *
      0.67
    );


  return {
    text:[
      text.slice(
        0,
        head
      ),

      "",
      "[MIDDLE COMPACTED]",
      "",

      text.slice(
        -(
          max -
          head
        )
      )
    ].join("\n"),

    compacted:true
  };
}


async function acquireDocument(
  env:
    Env,

  url:
    string,

  sourceKey:
    string,

  cities:
    string[],

  raceDate:
    string
) {
  const failures:
    any[] = [];


  const adapter =
    expertAdapterFor(
      sourceKey
    );


  const adapterOwnsUrl =
    Boolean(
      adapter.acquireHtml &&
      (
        adapter.ownsAcquisition
          ? adapter.ownsAcquisition(
              url
            )
          : true
      )
    );


  /*
   * Interactive source acquisition is fail-closed.
   *
   * If historical state selection fails, never fall back to
   * today's static HTML and ingest the wrong race date.
   */
  if (
    adapterOwnsUrl &&
    adapter.acquireHtml
  ) {
    try {
      const acquired =
        await adapter.acquireHtml({
          env,
          url,
          sourceKey,
          raceDate,
          cities
        });


      const normalized =
        expertArticleTextFromHtml(
          acquired.html
        );


      const compacted =
        compactText(
          normalized.text,
          cities
        );


      const quality =
        preflight(
          sourceKey,
          compacted.text,
          cities
        );


      if (!quality.ok) {
        throw new Error(
          String(
            quality.reason ??
            "ADAPTER_PREFLIGHT_FAILED"
          )
        );
      }


      return {
        stage:
          acquired.stage,

        acquired,
        normalized,

        semanticText:
          compacted.text,

        compacted:
          compacted.compacted,

        failures:[]
      };

    } catch(error) {
      throw new Error(
        "EXPERT_ADAPTER_DOCUMENT_ACQUISITION_FAILED:" +
        JSON.stringify([
          {
            stage:
              "browser-session",

            url,

            error:
              errorMessage(
                error
              )
          }
        ])
      );
    }
  }


  /*
   * Ordinary static article acquisition is HTTP-first.
   *
   * Browser Run Quick Actions are fallback only.
   *
   * Do not make static sources adapter-owned merely to
   * achieve HTTP-first acquisition.
   */
  const normalArticleStages = [
    "http" as const,

    ...EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
      .filter(
        stage =>
          stage !==
          "http"
      )
  ];


  for (
    const stage of
    normalArticleStages
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          url,
          stage
        );


      const normalized =
        expertArticleTextFromHtml(
          acquired.html
        );


      const compacted =
        compactText(
          normalized.text,
          cities
        );


      const quality =
        preflight(
          sourceKey,
          compacted.text,
          cities
        );


      if (!quality.ok) {
        failures.push({
          stage,

          bodyLength:
            acquired.bodyLength,

          normalizedCharacters:
            normalized.outputCharacters,

          reason:
            quality.reason
        });

        continue;
      }


      return {
        stage,
        acquired,
        normalized,

        semanticText:
          compacted.text,

        compacted:
          compacted.compacted,

        failures
      };

    } catch(error) {
      failures.push({
        stage,

        error:
          errorMessage(
            error
          )
      });
    }
  }


  const accessRestricted =
    failures.some(
      failure =>
        String(
          failure?.reason ??
          ""
        ).startsWith(
          "ACCESS_RESTRICTED:"
        )
    );


  if (accessRestricted) {
    throw new Error(
      "EXPERT_ACCESS_RESTRICTED:" +
      JSON.stringify(
        failures
      )
    );
  }


  throw new Error(
    "EXPERT_DOCUMENT_ACQUISITION_FAILED:" +
    JSON.stringify(
      failures
    )
  );
}


function finalizeExtraction(
  raw:
    RawExpertExtraction,

  method:
    string,

  diagnostics:
    unknown
): ExtractedExperts {
  const extraction =
    mapRawExpertExtraction(
      raw
    );


  return {
    extraction,

    status:
      extraction.picks.length
        ? "success"
        : "semantic-empty",

    method,

    diagnostics:{
      ...(
        diagnostics &&
        typeof diagnostics ===
          "object"
          ? diagnostics
          : {}
      ),

      rawRaceCount:
        raw.races.length,

      mappedPickCount:
        extraction.picks.length
    }
  };
}


export async function extractExperts(
  env:
    Env,

  url:
    string,

  sourceName:
    string,

  sourceKey =
    "",

  raceDateOverride?:
    string
): Promise<ExtractedExperts> {
  const raceDate =
    raceDateOverride ??
    turkeyDate();


  const meetings =
    await env.DB.prepare(`
      SELECT city
      FROM meetings
      WHERE race_date = ?
      ORDER BY city
    `)
      .bind(
        raceDate
      )
      .all<any>();


  const cities =
    (
      meetings.results ??
      []
    )
      .map(
        row =>
          String(
            row.city
          )
      )
      .filter(Boolean);


  if (!cities.length) {
    throw new Error(
      "EXPERT_NO_CANONICAL_MEETINGS"
    );
  }


  const targetCities =
    targetCitiesForUrl(
      url,
      cities
    );


  if (!targetCities.length) {
    throw new Error(
      "EXPERT_TARGET_CITY_SCOPE_INVALID"
    );
  }


  const raceRows =
    await env.DB.prepare(`
      SELECT
        city,
        race_number,
        sixfold_start_numbers_json
      FROM races
      WHERE race_date = ?
      ORDER BY city,race_number
    `)
      .bind(
        raceDate
      )
      .all<any>();


  const sixfoldStarts:
    Array<{
      city:string;
      sixfoldNumber:number;
      raceNumber:number;
    }> = [];


  for (
    const row of
    raceRows.results ??
    []
  ) {
    let values:
      unknown = [];


    try {
      values =
        JSON.parse(
          String(
            row.sixfold_start_numbers_json ??
            "[]"
          )
        );

    } catch {
      values=[];
    }


    if (!Array.isArray(values)) {
      continue;
    }


    for (const value of values) {
      const sixfoldNumber =
        Number(value);


      const raceNumber =
        Number(
          row.race_number
        );


      if (
        Number.isInteger(
          sixfoldNumber
        ) &&
        sixfoldNumber > 0 &&
        Number.isInteger(
          raceNumber
        ) &&
        raceNumber > 0
      ) {
        sixfoldStarts.push({
          city:
            String(
              row.city
            ),

          sixfoldNumber,
          raceNumber
        });
      }
    }
  }


  const targetSixfoldStarts =
    sixfoldStarts.filter(
      value =>
        targetCities.some(
          city =>
            normalizeExpertSearchText(
              city
            ) ===
            normalizeExpertSearchText(
              value.city
            )
        )
    );


  const document =
    await acquireDocument(
      env,
      url,
      sourceKey,
      targetCities,
      raceDate
    );


  /*
   * D1 has no canonical sixfold-start row for every city/date
   * (upstream program ingestion coverage varies). Coupon-leg
   * sources routinely state their own day's start race in the
   * article's own intro line, e.g.
   * "... Altılı Ganyan 3. Koşu ile saat 18.00 ekranlara
   * gelecektir." — trust that self-declared fact only where no
   * canonical row already exists, so canonical D1 data always
   * wins when both are present.
   */
  const effectiveSixfoldStarts =
    [...targetSixfoldStarts];

  for (
    const city of
    targetCities
  ) {
    const hasCanonical =
      targetSixfoldStarts.some(
        value =>
          normalizeExpertSearchText(
            value.city
          ) ===
          normalizeExpertSearchText(
            city
          )
      );

    if (hasCanonical) {
      continue;
    }

    /*
     * A day with more than one Altılı Ganyan sequence states
     * each one's own start race (e.g. "... 2. Altılı Ganyan
     * 4. Koşu ile saat 19.00 ekranlara gelecektir."). Matching
     * "altılı ganyan N. koşu" without checking for that leading
     * sequence number would grab the SECOND sequence's start
     * race and misapply it as the first sequence's — only a
     * match with no leading sequence digit, or an explicit "1.",
     * is actually about the first sequence.
     */
    const selfStatedMatches =
      [
        ...normalizeExpertSearchText(
          document.semanticText
        ).matchAll(
          /(?:(\d{1,2})\s+)?altili\s+ganyan\s+(\d{1,2})\s*\.?\s*kosu/g
        )
      ];

    const firstSequenceMatch =
      selfStatedMatches.find(
        match =>
          !match[1] ||
          Number(match[1]) === 1
      );

    const raceNumber =
      firstSequenceMatch
        ? Number(firstSequenceMatch[2])
        : NaN;

    if (
      Number.isInteger(raceNumber) &&
      raceNumber > 0 &&
      raceNumber <= 30
    ) {
      effectiveSixfoldStarts.push({
        city,
        sixfoldNumber:1,
        raceNumber
      });
    }
  }


  const sourceConfig =
    expertSourceConfig(
      sourceKey
    );


  const completenessProfile =
    sourceConfig
      .completenessProfile ??
    (
      sourceConfig.promptProfile ===
        "liderform"
        ? "liderform-main"
        : "none"
    );


  const liderformMode =
    completenessProfile ===
      "liderform-main" ||
    isLiderformSourceName(
      sourceName
    );


  const couponExpected =
    completenessProfile ===
      "coupon-explicit"
      ? explicitCouponExpectedSelections(
          document.semanticText,
          targetCities,
          effectiveSixfoldStarts
        )
      : [];


  const basePrompt =
    expertExtractionPrompt(
      sourceName,
      raceDate,
      targetCities,
      sourceKey,
      effectiveSixfoldStarts
    );


  const prompt =
    couponExpected.length
      ? [
          basePrompt,
          "",
          explicitCouponExpectationPrompt(
            couponExpected
          )
        ].join("\n")
      : basePrompt;


  const requireRace =
    liderformMode ||
    couponExpected.length > 0 ||
    sourceKey ===
      "afa" ||
    sourceKey ===
      "ganyan_canavari";


  const requireSelectionPerRace =
    liderformMode ||
    sourceKey ===
      "afa";


  /*
   * A completeness failure here means the model's own JSON
   * output dropped one deterministic item (a stated banko pick,
   * one race panel) that the source text plainly contains — a
   * known Workers AI sampling flake, not a pipeline defect,
   * confirmed live against horseturk (Adana R3 banko) and afa
   * (İstanbul race 9). A single fresh resample gives the model
   * an independent second chance before giving up.
   */
  const maxExtractionAttempts =
    2;

  let semantic:
    Awaited<
      ReturnType<
        typeof extractExpertJsonWithWorkersAi
      >
    > | null =
    null;

  let afaCompleteness:
    ReturnType<
      typeof inspectAfaCompleteness
    > | null =
    null;

  let completeness:any =
    null;

  for (
    let attempt=1;
    attempt<=maxExtractionAttempts;
    attempt++
  ) {
    semantic =
      await extractExpertJsonWithWorkersAi(
        env,
        document.semanticText,
        prompt,
        {
          requireRace,

          /*
           * Explicit coupon sources can contain bare leg grids.
           * Do not force AI to manufacture a semantic selection
           * in every returned race.
           */
          requireSelectionPerRace
        }
      );


    if (couponExpected.length) {
      semantic = {
        ...semantic,

        value:
          backfillExplicitCouponAnchors(
            semantic.value,
            couponExpected
          )
      };
    }


    afaCompleteness =
      sourceKey ===
        "afa"
        ? inspectAfaCompleteness(
            semantic.value,
            document.semanticText,
            targetCities
          )
        : null;


    completeness =
      liderformMode
        ? {
            profile:
              "liderform-main",

            ...inspectLiderformCompleteness(
              semantic.value,
              document.normalized.text,
              targetCities
            )
          }

        : couponExpected.length
          ? {
              profile:
                "coupon-explicit",

              ...inspectExplicitCouponCompleteness(
                semantic.value,
                couponExpected
              )
            }

          : null;


    const incomplete =
      (
        afaCompleteness &&
        !afaCompleteness.complete
      ) ||
      (
        completeness &&
        !completeness.complete
      );

    if (
      !incomplete ||
      attempt ===
        maxExtractionAttempts
    ) {
      break;
    }
  }


  if (
    afaCompleteness &&
    !afaCompleteness.complete
  ) {
    throw new Error(
      "EXPERT_INCOMPLETE_AFA_RACE_COVERAGE:" +
      JSON.stringify(
        afaCompleteness
      )
    );
  }


  if (
    completeness &&
    !completeness.complete
  ) {
    throw new Error(
      (
        completeness.profile ===
          "coupon-explicit"
          ? "EXPERT_INCOMPLETE_EXPLICIT_SELECTIONS:"
          : "EXPERT_INCOMPLETE_MAIN_SELECTIONS:"
      ) +
      JSON.stringify(
        completeness
      )
    );
  }


  if (!semantic) {
    throw new Error(
      "EXPERT_EXTRACTION_NEVER_ATTEMPTED"
    );
  }


  let acceptedSemantic:
    RawExpertExtraction =
    semantic.value;


  let explicitAnchorFilter:
    any =
    null;


  /*
   * HorseTurk-style explicit coupon sources:
   *
   * AI is still responsible for JSON extraction, but bare
   * coupon grid numbers are not allowed to become semantic
   * picks unless they match a deterministic explicit
   * BANKO/TEK source anchor.
   */
  if (
    sourceConfig
      .explicitAnchorPolicy ===
      "allowlist" &&
    couponExpected.length
  ) {
    const filtered =
      filterRawToExplicitAnchors(
        acceptedSemantic,
        couponExpected
      );


    acceptedSemantic =
      filtered.value;


    explicitAnchorFilter =
      filtered.diagnostics;
  }


  let canonicalSanitation:
    any =
    null;


  /*
   * Some structured pages (currently AFA) occasionally cause
   * Workers AI to emit one extra canonical-invalid identity.
   *
   * Never invent a runner:
   * - exact canonical identity -> keep
   * - unique city + horseNumber + horseName -> repair race
   * - otherwise -> drop AI noise
   */
  if (
    sourceConfig
      .canonicalOutputPolicy ===
      "repair-drop-ai-noise"
  ) {
    const runnerRows =
      await env.DB.prepare(`
        SELECT
          city,
          race_number,
          horse_number,
          horse_name
        FROM runners
        WHERE race_date = ?
        ORDER BY
          city,
          race_number,
          horse_number
      `)
        .bind(
          raceDate
        )
        .all<any>();


    const sanitized =
      sanitizeRawAgainstCanonical(
        acceptedSemantic,

        (
          runnerRows.results ??
          []
        ).map(
          row => ({
            city:
              String(
                row.city
              ),

            raceNumber:
              Number(
                row.race_number
              ),

            horseNumber:
              Number(
                row.horse_number
              ),

            horseName:
              String(
                row.horse_name
              )
          })
        )
      );


    acceptedSemantic =
      sanitized.value;


    canonicalSanitation =
      sanitized.diagnostics;
  }


  return finalizeExtraction(
    acceptedSemantic,

    `${document.stage}-workers-ai-json`,

    {
      acquisition:{
        stage:
          document.stage,

        bodyLength:
          document.acquired
            .bodyLength,

        previousFailures:
          document.failures,

        adapterDiagnostics:
          (document.acquired as any)
            ?.diagnostics ??
          null
      },

      articleText:{
        selectedRoot:
          document.normalized
            .selectedRoot,

        originalCharacters:
          document.normalized
            .originalCharacters,

        normalizedCharacters:
          document.normalized
            .outputCharacters,

        semanticCharacters:
          document.semanticText
            .length,

        compacted:
          document.compacted,

        hardTruncated:
          document.normalized
            .truncated
      },

      sixfoldStarts:
        effectiveSixfoldStarts,

      targetCities,

      postProcessing:{
        explicitAnchorPolicy:
          sourceConfig
            .explicitAnchorPolicy ??
          "augment",

        canonicalOutputPolicy:
          sourceConfig
            .canonicalOutputPolicy ??
          "strict",

        semanticRawRaceCount:
          semantic.value
            .races
            .length,

        acceptedRaceCount:
          acceptedSemantic
            .races
            .length,

        explicitAnchorFilter,
        canonicalSanitation
      },

      /*
       * Admin preview/root-cause evidence.
       * This is the exact normalized semantic input sent to AI.
       */
      semanticInput:{
        excerpt:
          document.semanticText.slice(
            0,
            2400
          ),

        containsBanko:
          normalizeExpertSearchText(
            document.semanticText
          ).includes(
            normalizeExpertSearchText(
              "banko"
            )
          ),

        containsTek:
          normalizeExpertSearchText(
            document.semanticText
          ).includes(
            normalizeExpertSearchText(
              "tek"
            )
          ),

        containsFavorite:
          normalizeExpertSearchText(
            document.semanticText
          ).includes(
            normalizeExpertSearchText(
              "favori"
            )
          ),

        containsRival:
          normalizeExpertSearchText(
            document.semanticText
          ).includes(
            normalizeExpertSearchText(
              "rakip"
            )
          ),

        containsSurprise:
          normalizeExpertSearchText(
            document.semanticText
          ).includes(
            normalizeExpertSearchText(
              "sürpriz"
            )
          )
      },

      semantic:
        semantic.diagnostics,

      completeness,
      afaCompleteness
    }
  );
}
