import type {
  Env
} from "../env";

import type {
  ExpertPickInput
} from "../types/models";

import {
  errorMessage,
  sha256,
  turkeyDate
} from "../shared";

import {
  expertCheckIntervalMs,
  expertFailureBackoffRemainingMs
} from "./policy";

import {
  expertHttpFingerprint
} from "./fingerprint";

import {
  extractExperts
} from "./extractor";

import {
  validateExpertPicks
} from "./validator";

import {
  replaceExpertPicksForDate
} from "./persistence";

import {
  activeExpertSources,
  markExpertChecked,
  markExpertFailure,
  markExpertHealthy,
  markExpertOutcome,
  recordExpertDiscovery,
  recordExpertRefreshTrace
} from "./source-repository";

import {
  resolveExpertSourceTargets
} from "./source-resolver";

import {
  mapLimit
} from "./concurrency";

import {
  externalTargetUrl,
  isCityScopedTarget
} from "./adapters/target-scope";

import type {
  ExpertRefreshResult,
  ExpertSource
} from "./source-types";


async function nextRaceMinutes(
  env:
    Env
): Promise<number | null> {
  const row =
    await env.DB.prepare(`
      SELECT starts_at
      FROM races
      WHERE race_date = ?
        AND starts_at > ?
      ORDER BY starts_at
      LIMIT 1
    `)
      .bind(
        turkeyDate(),
        new Date()
          .toISOString()
      )
      .first<any>();


  if (!row?.starts_at) {
    return null;
  }


  return Math.max(
    0,

    (
      Date.parse(
        row.starts_at
      ) -
      Date.now()
    ) / 60000
  );
}


async function canonicalCities(
  env:
    Env,

  raceDate:
    string
): Promise<string[]> {
  const result =
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


  return (
    result.results ??
    []
  )
    .map(
      row =>
        String(
          row.city
        )
    )
    .filter(Boolean);
}


async function rowsExist(
  env:
    Env,

  raceDate:
    string,

  sourceKey:
    string
): Promise<boolean> {
  const row =
    await env.DB.prepare(`
      SELECT 1 AS found
      FROM expert_predictions
      WHERE race_date = ?
        AND source_key = ?
      LIMIT 1
    `)
      .bind(
        raceDate,
        sourceKey
      )
      .first<any>();


  return Boolean(
    row?.found
  );
}


/*
 * verified-article.ts's discovery diagnostics record each verified
 * candidate's individual status, including "access-restricted" for
 * a genuine VIP/paywall detection (article found, content refused,
 * not the source simply having no card yet). Other adapters don't
 * carry this shape, so this degrades to "no evidence of a block"
 * rather than throwing.
 */
export function resolutionBlockedByAccess(
  resolution:
    unknown
): boolean {
  const verified =
    (resolution as any)
      ?.diagnostics
      ?.final
      ?.verified;

  return (
    Array.isArray(verified) &&
    verified.some(
      (candidate: any) =>
        candidate?.status ===
        "access-restricted"
    )
  );
}


function identity(
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


function mergePicks(
  values:
    ExpertPickInput[]
): ExpertPickInput[] {
  const result =
    new Map<
      string,
      ExpertPickInput
    >();


  for (const pick of values) {
    const key =
      identity(
        pick
      );


    const old =
      result.get(
        key
      );


    if (!old) {
      result.set(
        key,
        {
          ...pick
        }
      );

      continue;
    }


    result.set(
      key,
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


async function bundleFingerprint(
  urls:
    string[]
): Promise<string | null> {
  /*
   * Dynamic city-scoped browser state cannot be fingerprinted
   * with a static HTTP hash of the base page.
   */
  if (
    urls.some(
      isCityScopedTarget
    )
  ) {
    return null;
  }


  const parts:
    Array<
      [string,string]
    > = [];


  for (const url of urls) {
    const fingerprint =
      await expertHttpFingerprint(
        url
      );


    if (!fingerprint) {
      return null;
    }


    parts.push([
      url,
      fingerprint.hash
    ]);
  }


  return sha256(
    JSON.stringify(
      parts
    )
  );
}


async function processSource(
  env:
    Env,

  source:
    ExpertSource,

  force:
    boolean
): Promise<ExpertRefreshResult> {
  const raceDate =
    turkeyDate();


  await markExpertChecked(
    env,
    source.source_key
  );


  const cities =
    await canonicalCities(
      env,
      raceDate
    );


  if (!cities.length) {
    return {
      source:
        source.source_key,

      status:
        "no-current-card",

      count:0
    };
  }


  await recordExpertRefreshTrace(
    env,
    source.source_key,
    "PROCESS_START",
    null,
    {
      raceDate,
      cities,
      force
    }
  );


  const resolution =
    await resolveExpertSourceTargets(
      env,
      source,
      raceDate,
      cities
    );


  await recordExpertRefreshTrace(
    env,
    source.source_key,
    "RESOLUTION_RESULT",
    resolution.targets[0] ??
      null,
    resolution
  );


  if (
    resolution.status ===
      "unavailable"
  ) {
    throw new Error(
      `EXPERT_SOURCE_TARGET_UNAVAILABLE:${source.source_key}`
    );
  }


  if (
    resolution.status ===
      "not-published" ||
    !resolution.targets.length
  ) {
    await markExpertOutcome(
      env,
      source.source_key,
      resolutionBlockedByAccess(
        resolution
      )
        ? "blocked"
        : "no-picks-today"
    );

    return {
      source:
        source.source_key,

      status:
        "article-not-published",

      count:0,

      attempts:
        resolution.diagnostics
          ?.attempts ??
        []
    };
  }


  if (
    resolution.mode ===
      "article" &&
    resolution.discoveredFromUrl
  ) {
    await recordExpertDiscovery(
      env,
      source.source_key,
      resolution.targets[0],
      resolution.discoveredFromUrl,
      resolution.discoveryMethod ??
        "anchored-discovery"
    );
  }


  const currentRows =
    await rowsExist(
      env,
      raceDate,
      source.source_key
    );


  const fingerprint =
    await bundleFingerprint(
      resolution.targets
    );


  if (
    !force &&
    currentRows &&
    fingerprint &&
    source.content_hash ===
      fingerprint
  ) {
    return {
      source:
        source.source_key,

      status:
        "unchanged",

      count:0,

      workingUrl:
        externalTargetUrl(
          resolution.targets[0]
        )
    };
  }


  const all:
    ExpertPickInput[] = [];


  const attempts:
    any[] = [];


  /*
   * Each target (typically one per city) is isolated: a single
   * city throwing during extraction, coming back empty, or
   * failing canonical validation never discards a sibling
   * city's already-good result. persistExpertPicksForDate below
   * only touches the cities present in `all`, so a city that
   * fails here simply keeps whatever it already had — it is
   * never wiped by another city's success and never blocks it.
   */
  for (const url of resolution.targets) {
    try {
      const extracted =
        await extractExperts(
          env,
          url,
          source.source_name,
          source.source_key,
          raceDate
        );


      const raw =
        extracted.extraction
          .picks;


      if (!raw.length) {
        attempts.push({
          url,

          outcome:
            "SEMANTIC_EMPTY",

          method:
            extracted.method,

          diagnostics:
            extracted.diagnostics
        });

        continue;
      }


      const validated =
        await validateExpertPicks(
          env,
          raw,
          raceDate
        );


      attempts.push({
        url,

        method:
          extracted.method,

        extracted:
          raw.length,

        validated:
          validated.length,

        outcome:
          validated.length ===
            raw.length
            ? "CANONICAL_MATCH"
            : "CANONICAL_INCOMPLETE",

        diagnostics:
          extracted.diagnostics
      });


      /*
       * validateExpertPicks already dropped whatever failed to
       * resolve to a real canonical runner (ganyan_canavari's
       * İstanbul confirmed this live: 6 of 7 extracted picks
       * matched real runners, 1 didn't). Persist that verified
       * subset rather than discarding all of it over the one
       * AI-noise pick — only a batch with NOTHING verified is
       * worth rejecting outright.
       */
      if (!validated.length) {
        await recordExpertRefreshTrace(
          env,
          source.source_key,
          "BUNDLE_REJECTED",
          url,
          {
            reason:
              "canonical-incomplete",

            attempts
          }
        );

        continue;
      }


      all.push(
        ...validated
      );

    } catch (error) {
      attempts.push({
        url,

        outcome:
          "EXTRACTION_ERROR",

        error:
          errorMessage(
            error
          )
      });


      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "BUNDLE_REJECTED",
        url,
        {
          reason:
            "extraction-error",

          error:
            errorMessage(
              error
            ),

          attempts
        }
      );
    }
  }


  if (!all.length) {
    await markExpertOutcome(
      env,
      source.source_key,
      attempts.some(
        attempt =>
          attempt.outcome ===
          "EXTRACTION_ERROR"
      )
        ? "parse-error"
        : "no-picks-today"
    );

    return {
      source:
        source.source_key,

      status:
        "no-current-card",

      count:0,

      attempts
    };
  }


  const merged =
    mergePicks(
      all
    );


  if (!merged.length) {
    return {
      source:
        source.source_key,

      status:
        "no-current-card",

      count:0,

      attempts
    };
  }


  const contentHash =
    fingerprint ??
    await sha256(
      JSON.stringify({
        urls:
          resolution.targets,

        picks:
          merged
      })
    );


  await replaceExpertPicksForDate(
    env,
    raceDate,
    source.source_key,
    contentHash,
    merged
  );


  await markExpertHealthy(
    env,
    source.source_key,
    contentHash,
    externalTargetUrl(
      resolution.targets[0]
    ),
    {
      discoveredFromUrl:
        resolution.discoveredFromUrl,

      discoveryMethod:
        resolution.discoveryMethod,

      extractionMethod:
        attempts
          .map(
            attempt =>
              attempt.method
          )
          .filter(Boolean)
          .join("+")
    }
  );


  await recordExpertRefreshTrace(
    env,
    source.source_key,
    "SUCCESS",
    resolution.targets[0],
    {
      targets:
        resolution.targets,

      documents:
        resolution.targets.length,

      persisted:
        merged.length,

      attempts
    }
  );


  return {
    source:
      source.source_key,

    status:
      "updated",

    count:
      merged.length,

    workingUrl:
      resolution.targets[0],

    extractionMethod:
      attempts
        .map(
          attempt =>
            attempt.method
        )
        .filter(Boolean)
        .join("+"),

    attempts
  };
}


export async function refreshExpertsIfDue(
  env:
    Env,

  force =
    false
): Promise<any> {
  const minutes =
    await nextRaceMinutes(
      env
    );


  const interval =
    expertCheckIntervalMs(
      minutes
    );


  /*
   * Never weaken this:
   *
   * no upcoming race = no expert acquisition.
   */
  if (
    interval === null
  ) {
    return {
      refreshed:false,

      reason:
        "no-upcoming-race"
    };
  }


  const state =
    await env.DB.prepare(`
      SELECT
        MAX(last_checked_at)
          AS checked
      FROM source_registry
      WHERE enabled = 1
    `)
      .first<any>();


  if (
    !force &&
    state?.checked &&
    (
      Date.now() -
      Date.parse(
        state.checked
      )
    ) <
      interval
  ) {
    return {
      refreshed:false,

      reason:
        "fresh",

      nextRaceMinutes:
        minutes
    };
  }


  const sources =
    await activeExpertSources(
      env
    );


  const results =
    await mapLimit(
      sources,
      3,

      async source => {
        try {
          const retryAfterMs =
            force
              ? 0
              : expertFailureBackoffRemainingMs(
                  source.consecutive_failures ??
                    0,

                  source.last_failure_at,

                  minutes
                );


          if (
            retryAfterMs >
            0
          ) {
            return {
              source:
                source.source_key,

              status:
                "backoff",

              retryAfterMs
            } satisfies
              ExpertRefreshResult;
          }


          return await processSource(
            env,
            source,
            force
          );

        } catch(error) {
          await markExpertFailure(
            env,
            source.source_key
          );


          return {
            source:
              source.source_key,

            status:
              "failed",

            error:
              errorMessage(
                error
              )
          } satisfies
            ExpertRefreshResult;
        }
      }
    );


  return {
    refreshed:true,

    nextRaceMinutes:
      minutes,

    results
  };
}


export async function refreshExpertSource(
  env:
    Env,

  sourceKey:
    string
): Promise<any> {
  const key =
    String(
      sourceKey ??
      ""
    )
      .trim();


  if (!key) {
    throw new Error(
      "EXPERT_SOURCE_REQUIRED"
    );
  }


  const source =
    (
      await activeExpertSources(
        env
      )
    )
      .find(
        item =>
          item.source_key ===
          key
      );


  if (!source) {
    throw new Error(
      `EXPERT_SOURCE_NOT_FOUND:${key}`
    );
  }


  const minutes =
    await nextRaceMinutes(
      env
    );


  if (
    expertCheckIntervalMs(
      minutes
    ) ===
    null
  ) {
    return {
      source:key,
      ok:true,

      result:{
        source:key,

        status:
          "no-upcoming-race"
      } satisfies
        ExpertRefreshResult
    };
  }


  try {
    const result =
      await processSource(
        env,
        source,
        true
      );


    return {
      source:key,
      ok:true,
      result
    };

  } catch(error) {
    await markExpertFailure(
      env,
      key
    );


    return {
      source:key,
      ok:false,

      result:{
        source:key,

        status:
          "failed",

        error:
          errorMessage(
            error
          )
      }
    };
  }
}
