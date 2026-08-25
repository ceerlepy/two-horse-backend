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
    !expertSourceConfig(
      sourceKey
    )
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
    string[]
) {
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


  const document =
    await acquireDocument(
      env,
      url,
      sourceKey,
      cities
    );


  const prompt =
    expertExtractionPrompt(
      sourceName,
      raceDate,
      cities,
      sourceKey,
      sixfoldStarts
    );


  const liderformMode =
    expertSourceConfig(
      sourceKey
    )
      .promptProfile ===
      "liderform" ||
    isLiderformSourceName(
      sourceName
    );


  const semantic =
    await extractExpertJsonWithWorkersAi(
      env,
      document.semanticText,
      prompt,
      {
        requireSelectionPerRace:
          liderformMode
      }
    );


  const completeness =
    liderformMode
      ? inspectLiderformCompleteness(
          semantic.value,
          document.normalized.text,
          cities
        )
      : null;


  if (
    completeness &&
    !completeness.complete
  ) {
    throw new Error(
      "EXPERT_INCOMPLETE_MAIN_SELECTIONS:" +
      JSON.stringify(
        completeness
      )
    );
  }


  return finalizeExtraction(
    semantic.value,

    `${document.stage}-workers-ai-json`,

    {
      acquisition:{
        stage:
          document.stage,

        bodyLength:
          document.acquired
            .bodyLength,

        previousFailures:
          document.failures
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

      sixfoldStarts,

      semantic:
        semantic.diagnostics,

      completeness
    }
  );
}
