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
  inspectExplicitCouponCompleteness
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


  const accessDeniedTerm =
    (
      source.accessDeniedTerms ??
      []
    ).find(
      term =>
        normalized.includes(
          normalizeExpertSearchText(
            term
          )
        )
    );


  if (accessDeniedTerm) {
    return {
      ok:false,

      reason:
        `ACCESS_RESTRICTED:${accessDeniedTerm}`
    };
  }


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
          targetSixfoldStarts
        )
      : [];


  const basePrompt =
    expertExtractionPrompt(
      sourceName,
      raceDate,
      targetCities,
      sourceKey,
      targetSixfoldStarts
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


  const semantic =
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


  const afaCompleteness =
    sourceKey ===
      "afa"
      ? inspectAfaCompleteness(
          semantic.value,
          document.semanticText,
          targetCities
        )
      : null;


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


  const completeness:any =
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
        targetSixfoldStarts,

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
