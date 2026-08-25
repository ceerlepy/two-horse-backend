import type {
  Env
} from "../env";

import type {
  ExpertPickInput
} from "../types/models";

import {
  errorMessage,
  turkeyDate
} from "../shared";

import {
  resolveExpertSourceTargets
} from "./source-resolver";

import {
  extractExperts
} from "./extractor";

import {
  validateExpertPicks
} from "./validator";


function validDate(
  value:
    string
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/
    .test(value);
}


function key(
  pick:
    ExpertPickInput
): string {
  return [
    pick.city
      .normalize("NFKC")
      .toLocaleUpperCase(
        "tr-TR"
      ),

    pick.raceNumber,
    pick.horseNumber
  ].join("|");
}


function merge(
  picks:
    ExpertPickInput[]
): ExpertPickInput[] {
  const result =
    new Map<
      string,
      ExpertPickInput
    >();


  for (const pick of picks) {
    const identity =
      key(pick);

    const old =
      result.get(identity);


    if (!old) {
      result.set(
        identity,
        {...pick}
      );

      continue;
    }


    result.set(
      identity,
      {
        ...old,

        comment:
          String(
            pick.comment ??
            ""
          ).length >
          String(
            old.comment ??
            ""
          ).length
            ? pick.comment
            : old.comment,

        isFavorite:
          old.isFavorite ||
          pick.isFavorite,

        isBanko:
          old.isBanko ||
          pick.isBanko,

        isStrong:
          old.isStrong ||
          pick.isStrong,

        isStar:
          old.isStar ||
          pick.isStar,

        isRival:
          old.isRival ||
          pick.isRival,

        isSurprise:
          old.isSurprise ||
          pick.isSurprise,

        isAvoid:
          old.isAvoid ||
          pick.isAvoid,

        confidence:
          Math.max(
            old.confidence,
            pick.confidence
          )
      }
    );
  }


  return [
    ...result.values()
  ];
}


function summarize(
  picks:
    ExpertPickInput[]
) {
  const races =
    new Set(
      picks.map(
        pick =>
          `${pick.city}|${pick.raceNumber}`
      )
    );


  const count =
    (
      field:
        keyof ExpertPickInput
    ) =>
      picks.filter(
        pick =>
          Boolean(
            pick[field]
          )
      ).length;


  return {
    races:
      races.size,

    total:
      picks.length,

    main:
      picks.filter(
        pick =>
          pick.isFavorite ||
          pick.isBanko ||
          pick.isStrong ||
          pick.isStar ||
          pick.isSurprise
      ).length,

    favorite:
      count("isFavorite"),

    banko:
      count("isBanko"),

    strong:
      count("isStrong"),

    star:
      count("isStar"),

    rival:
      count("isRival"),

    surprise:
      count("isSurprise"),

    avoid:
      count("isAvoid")
  };
}


function rejectedPicks(
  raw:
    ExpertPickInput[],

  validated:
    ExpertPickInput[]
) {
  const accepted =
    new Set(
      validated.map(key)
    );


  return raw
    .filter(
      pick =>
        !accepted.has(
          key(pick)
        )
    )
    .map(
      pick => ({
        city:
          pick.city,

        raceNumber:
          pick.raceNumber,

        horseNumber:
          pick.horseNumber,

        horseName:
          pick.horseName,

        comment:
          pick.comment
      })
    );
}


function mainPicks(
  picks:
    ExpertPickInput[]
) {
  return picks
    .filter(
      pick =>
        pick.isFavorite ||
        pick.isBanko ||
        pick.isStrong ||
        pick.isStar ||
        pick.isSurprise
    )
    .map(
      pick => ({
        city:
          pick.city,

        raceNumber:
          pick.raceNumber,

        horseNumber:
          pick.horseNumber,

        horseName:
          pick.horseName,

        comment:
          pick.comment,

        labels:[
          pick.isFavorite
            ? "favorite"
            : null,

          pick.isBanko
            ? "banko"
            : null,

          pick.isStrong
            ? "strong"
            : null,

          pick.isStar
            ? "star"
            : null,

          pick.isSurprise
            ? "surprise"
            : null
        ].filter(Boolean),

        confidence:
          pick.confidence
      })
    );
}


export async function previewExpertSource(
  env:
    Env,

  sourceKey:
    string,

  raceDateOverride?:
    string
): Promise<any> {
  if (
    raceDateOverride &&
    !validDate(
      raceDateOverride
    )
  ) {
    return {
      ok:false,
      preview:true,
      persisted:false,

      error:
        "INVALID_RACE_DATE"
    };
  }


  const raceDate =
    raceDateOverride ??
    turkeyDate();


  const source =
    await env.DB.prepare(`
      SELECT
        source_key,
        source_name,
        homepage_url,
        last_working_url,
        last_discovered_article_url,
        last_discovered_article_at,
        content_hash,
        last_checked_at,
        last_success_at,
        last_failure_at,
        consecutive_failures,
        source_type,
        base_weight
      FROM source_registry
      WHERE source_key = ?
      LIMIT 1
    `)
      .bind(sourceKey)
      .first<any>();


  if (!source) {
    return {
      ok:false,
      preview:true,
      persisted:false,

      error:
        "EXPERT_SOURCE_NOT_FOUND"
    };
  }


  const meetings =
    await env.DB.prepare(`
      SELECT city
      FROM meetings
      WHERE race_date = ?
      ORDER BY city
    `)
      .bind(raceDate)
      .all<any>();


  const cities =
    (
      meetings.results ??
      []
    )
      .map(
        row =>
          String(row.city)
      )
      .filter(Boolean);


  if (!cities.length) {
    return {
      ok:false,
      preview:true,
      persisted:false,

      source:
        sourceKey,

      date:
        raceDate,

      error:
        "EXPERT_NO_CANONICAL_MEETINGS"
    };
  }


  const resolution =
    await resolveExpertSourceTargets(
      env,
      source,
      raceDate,
      cities
    );


  if (
    resolution.status !==
      "ready"
  ) {
    return {
      ok:
        resolution.status ===
        "not-published",

      preview:true,
      persisted:false,

      status:
        resolution.status,

      source:
        sourceKey,

      date:
        raceDate,

      cities,
      resolution,

      counts:
        summarize([]),

      extractionAttempts:[]
    };
  }


  const all:
    ExpertPickInput[] = [];

  const attempts:
    any[] = [];


  let promptTokens=0;
  let completionTokens=0;
  let totalTokens=0;
  let neurons=0;

  let hadFailure=false;
  let hadCanonicalIncomplete=false;
  let hadSemanticEmpty=false;


  /*
   * Diagnostic preview MUST inspect every resolved document.
   * Production persistence is still separate and fail-closed.
   */
  for (
    const url of
    resolution.targets
  ) {
    try {
      const extracted =
        await extractExperts(
          env,
          url,
          source.source_name,
          sourceKey,
          raceDate
        );


      const raw =
        extracted.extraction
          .picks;


      const validated =
        await validateExpertPicks(
          env,
          raw,
          raceDate,
          {
            writeAnomalies:false
          }
        );


      const diagnostics =
        extracted.diagnostics as any;


      const usage =
        diagnostics
          ?.semantic
          ?.usage ??
        {};


      promptTokens +=
        Number(
          usage.prompt_tokens ??
          0
        );

      completionTokens +=
        Number(
          usage.completion_tokens ??
          0
        );

      totalTokens +=
        Number(
          usage.total_tokens ??
          0
        );

      neurons +=
        Number(
          usage.neurons ??
          0
        );


      const completeCanonical =
        raw.length > 0 &&
        raw.length ===
          validated.length;


      attempts.push({
        url,

        method:
          extracted.method,

        status:
          extracted.status,

        extracted:
          raw.length,

        validated:
          validated.length,

        completeCanonical,

        rejectedPicks:
          rejectedPicks(
            raw,
            validated
          ),

        rawSample:
          raw.slice(
            0,
            20
          ),

        diagnostics
      });


      if (!raw.length) {
        hadSemanticEmpty =
          true;

        continue;
      }


      if (!completeCanonical) {
        hadCanonicalIncomplete =
          true;

        /*
         * Never mix a partially canonical document into
         * preview's accepted result set.
         */
        continue;
      }


      all.push(
        ...validated
      );

    } catch(error) {
      hadFailure =
        true;

      attempts.push({
        url,

        status:
          "failed",

        error:
          errorMessage(error)
      });

      /*
       * Preview continues to the next resolved target.
       */
      continue;
    }
  }


  const picks =
    merge(all);


  const status =
    hadFailure
      ? "extraction-failed"

      : hadCanonicalIncomplete
        ? "canonical-incomplete"

        : hadSemanticEmpty
          ? (
              picks.length
                ? "partial-semantic-empty"
                : "semantic-empty"
            )

          : picks.length
            ? "success"
            : "semantic-empty";


  const ok =
    status ===
      "success";


  return {
    ok,
    preview:true,
    persisted:false,

    status,

    source:
      sourceKey,

    date:
      raceDate,

    cities,

    mode:
      resolution.mode,

    targets:
      resolution.targets,

    resolution,

    extractionAttempts:
      attempts,

    counts:
      summarize(picks),

    mainPicks:
      mainPicks(picks),

    semanticUsage:{
      promptTokens,
      completionTokens,
      totalTokens,
      neurons
    }
  };
}
