import type {
  Env
} from "../env";

import {
  errorMessage,
  sha256,
  turkeyDate
} from "../shared";

import {
  expertCheckIntervalMs
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
  persistExpertPicks
} from "./persistence";

import {
  activeExpertSources,
  markExpertChecked,
  markExpertFailure,
  markExpertHealthy,
  recordExpertRefreshTrace
} from "./source-repository";

import {
  expertLandingUrls,
  expertUrlCandidates
} from "./source-urls";

import {
  discoverExpertArticleUrls
} from "./discovery";

import {
  mapLimit
} from "./concurrency";

import type {
  ExpertRefreshResult,
  ExpertSource
} from "./source-types";


async function nextRaceMinutes(
  env:Env
):Promise<number | null> {
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
        new Date().toISOString()
      )
      .first<any>();

  if (!row?.starts_at) {
    return null;
  }

  return Math.max(
    0,
    (
      Date.parse(row.starts_at) -
      Date.now()
    ) / 60000
  );
}


async function extractionHash(
  picks:unknown
):Promise<string> {
  return sha256(
    JSON.stringify(picks)
  );
}


async function todayRowsExist(
  env:Env,
  sourceKey:string
):Promise<boolean> {
  const row =
    await env.DB.prepare(`
      SELECT 1 AS found

      FROM expert_predictions

      WHERE
        race_date = ?
        AND source_key = ?

      LIMIT 1
    `)
      .bind(
        turkeyDate(),
        sourceKey
      )
      .first<any>();

  return Boolean(row);
}


async function processSource(
  env:Env,
  source:ExpertSource,
  force:boolean
):Promise<ExpertRefreshResult> {
  const candidates =
    expertUrlCandidates(
      source
    );


  if (!candidates.length) {
    return {
      source:
        source.source_key,

      status:
        "no-url"
    };
  }


  await markExpertChecked(
    env,
    source.source_key
  );


  const currentRowsExist =
    await todayRowsExist(
      env,
      source.source_key
    );


  /*
   * Durable semantic entry/current-page URLs.
   *
   * Dynamically discovered daily articles are not part
   * of this list.
   */
  let landingUrls =
    expertLandingUrls(
      source
    );


  const storedWorkingUrl =
    source.last_working_url &&
    candidates.includes(
      source.last_working_url
    )
      ? source.last_working_url
      : null;


  const cachedIsLanding =
    Boolean(
      storedWorkingUrl &&
      landingUrls.includes(
        storedWorkingUrl
      )
    );


  const currentTurkeyDate =
    turkeyDate();


  let lastSuccessDate:
    string | null = null;


  if (source.last_success_at) {
    const parsedSuccess =
      new Date(
        source.last_success_at
      );


    if (
      !Number.isNaN(
        parsedSuccess.getTime()
      )
    ) {
      lastSuccessDate =
        turkeyDate(
          parsedSuccess
        );
    }
  }


  const workingSucceededToday =
    lastSuccessDate ===
    currentTurkeyDate;


  /*
   * Daily discovered article:
   *
   * - current-date rows exist OR it succeeded today:
   *   same-day cache/recovery is allowed.
   *
   * - new Turkey date with no current rows:
   *   yesterday's article is skipped completely.
   *
   * Stable landing/current page:
   *
   * - same URL may remain valid across dates.
   */
  const cachedWorkingUrl =
    storedWorkingUrl &&
    (
      cachedIsLanding ||
      currentRowsExist ||
      workingSucceededToday
    )
      ? storedWorkingUrl
      : null;


  const staleArticleSkipped =
    storedWorkingUrl &&
    !cachedWorkingUrl
      ? storedWorkingUrl
      : null;


  await recordExpertRefreshTrace(
    env,
    source.source_key,
    "PROCESS_START",
    cachedWorkingUrl,
    {
      cachedWorkingUrl,
      cachedIsLanding,
      staleArticleSkipped,
      currentRowsExist,
      lastSuccessDate,
      currentTurkeyDate,
      landingUrls
    }
  );


  const attempts:any[] = [];


  if (staleArticleSkipped) {
    attempts.push({
      url:
        staleArticleSkipped,

      outcome:
        "STALE_DAILY_ARTICLE_SKIPPED",

      aiInvoked:
        false
    });
  }


  let hadSemanticSuccess = false;
  let lastError:unknown = null;


  /*
   * FAST PATH
   * =========
   *
   * last_working_url already produced canonical picks in
   * a previous successful run. Do not waste Browser Run
   * calls trying to "discover" from an article page.
   *
   * Read it directly first.
   */
  if (cachedWorkingUrl) {
    try {
      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "CACHED_CHECK_START",
        cachedWorkingUrl
      );


      /*
       * COST GATE
       * =========
       *
       * Cheap HTTP fingerprint always happens before
       * repeat semantic AI when cache reuse is eligible.
       *
       * Stable landing/current pages include hrefs in the
       * fingerprint.
       *
       * Daily articles use editorial visible text only.
       */
      const fingerprint =
        await expertHttpFingerprint(
          cachedWorkingUrl,
          {
            includeLinks:
              cachedIsLanding
          }
        );


      const fingerprintMatches =
        Boolean(
          !force &&
          fingerprint &&
          source.content_hash &&
          source.content_hash ===
            fingerprint.hash
        );


      if (
        fingerprintMatches &&
        currentRowsExist
      ) {
        await recordExpertRefreshTrace(
          env,
          source.source_key,
          "CACHED_UNCHANGED",
          cachedWorkingUrl,
          {
            aiInvoked:
              false,

            fingerprintMatched:
              true,

            currentRowsExist:
              true
          }
        );


        return {
          source:
            source.source_key,

          status:
            "unchanged",

          count:
            0,

          workingUrl:
            cachedWorkingUrl,

          attempts
        } as ExpertRefreshResult;
      }


      if (
        fingerprintMatches &&
        !currentRowsExist &&
        cachedIsLanding
      ) {
        /*
         * Stable page is unchanged and there are no rows
         * for today's card.
         *
         * Re-running semantic AI over identical content
         * cannot create a new card.
         *
         * Skip this unchanged entry and allow alternative
         * landing URLs/discovery candidates to continue.
         */
        attempts.push({
          url:
            cachedWorkingUrl,

          outcome:
            "CACHED_STABLE_UNCHANGED_SKIP_AI",

          aiInvoked:
            false,

          fingerprintMatched:
            true
        });


        await recordExpertRefreshTrace(
          env,
          source.source_key,
          "CACHED_STABLE_UNCHANGED",
          cachedWorkingUrl,
          {
            aiInvoked:
              false,

            fingerprintMatched:
              true,

            currentRowsExist:
              false
          }
        );


        landingUrls =
          landingUrls.filter(
            url =>
              url !==
              cachedWorkingUrl
          );

      } else {
        /*
         * Content changed, force refresh was explicitly
         * requested, or cheap fingerprinting was not
         * available.
         *
         * Semantic extraction is now justified.
         */
        const extracted =
          await extractExperts(
            env,
            cachedWorkingUrl,
            source.source_name
          );


        hadSemanticSuccess =
          true;


        const rawPicks =
          extracted.extraction.picks;


        await recordExpertRefreshTrace(
          env,
          source.source_key,
          "CACHED_EXTRACTION_RESULT",
          cachedWorkingUrl,
          {
            extractionMethod:
              extracted.method,

            extractionStatus:
              extracted.status,

            extracted:
              rawPicks.length,

            diagnostics:
              extracted.diagnostics
          }
        );


        if (!rawPicks.length) {
          attempts.push({
            url:
              cachedWorkingUrl,

            acquisition:
              extracted.method,

            extractionStatus:
              extracted.status,

            extracted:
              0,

            validated:
              0,

            outcome:
              "CACHED_NO_CURRENT_CARD"
          });

        } else {
          const validPicks =
            await validateExpertPicks(
              env,
              rawPicks
            );


          await recordExpertRefreshTrace(
            env,
            source.source_key,
            "CACHED_VALIDATION_RESULT",
            cachedWorkingUrl,
            {
              extracted:
                rawPicks.length,

              validated:
                validPicks.length,

              extractionMethod:
                extracted.method
            }
          );


          attempts.push({
            url:
              cachedWorkingUrl,

            acquisition:
              extracted.method,

            extracted:
              rawPicks.length,

            validated:
              validPicks.length,

            outcome:
              validPicks.length
                ? "CACHED_CANONICAL_MATCH"
                : "CACHED_NO_CANONICAL_MATCH"
          });


          if (validPicks.length) {
            const contentHash =
              fingerprint?.hash ??
              await extractionHash(
                rawPicks
              );


            await persistExpertPicks(
              env,
              source.source_key,
              contentHash,
              validPicks
            );


            await markExpertHealthy(
              env,
              source.source_key,
              contentHash,
              cachedWorkingUrl,
              {
                /*
                 * Cache reuse is not discovery.
                 * Preserve original successful provenance.
                 */
                discoveredFromUrl:
                  null,

                discoveryMethod:
                  null,

                extractionMethod:
                  extracted.method
              }
            );


            await recordExpertRefreshTrace(
              env,
              source.source_key,
              "SUCCESS",
              cachedWorkingUrl,
              {
                workingUrl:
                  cachedWorkingUrl,

                persisted:
                  validPicks.length,

                discoveryMethod:
                  "preserved-from-original-discovery",

                extractionMethod:
                  extracted.method,

                cached:
                  true
              }
            );


            return {
              source:
                source.source_key,

              status:
                "updated",

              count:
                validPicks.length,

              extractionMethod:
                extracted.method,

              workingUrl:
                cachedWorkingUrl,

              attempts
            } as ExpertRefreshResult;
          }
        }
      }

    } catch (error) {
      lastError =
        error;


      attempts.push({
        url:
          cachedWorkingUrl,

        outcome:
          "CACHED_ACQUISITION_OR_EXTRACTION_FAILED",

        error:
          errorMessage(
            error
          )
      });


      /*
       * Cache is only an optimization.
       * Normal discovery remains authoritative fallback.
       */
    }
  }


  /*
   * First discover CURRENT article URLs from each
   * landing/index/category URL.
   *
   * The discovery itself uses the existing semantic
   * acquisition fallback:
   *
   * CF_JSON(url)
   * -> CF_SCRAPE(url) -> CF_JSON(html)
   * -> CF_CONTENT(url) -> CF_JSON(html)
   */
  const today =
    turkeyDate();

  const meetings =
    await env.DB.prepare(`
      SELECT city
      FROM meetings
      WHERE race_date = ?
      ORDER BY city
    `)
      .bind(today)
      .all<any>();

  const cities =
    (meetings.results ?? [])
      .map(
        (row:any) =>
          String(row.city)
      );


  const articleUrls:string[] = [];
  const articleSeen =
    new Set<string>();

  /*
   * Preserve provenance for every discovered article:
   * article URL -> landing URL + acquisition method.
   */
  const discoveryProvenance =
    new Map<
      string,
      {
        landingUrl:string;
        method:string;
      }
    >();


  for (const landingUrl of landingUrls) {
    try {
      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "DISCOVERY_START",
        landingUrl
      );

      const discovery =
        await discoverExpertArticleUrls(
          env,
          landingUrl,
          source.source_name,
          cities
        );


      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "DISCOVERY_RESULT",
        landingUrl,
        {
          method:
            discovery.method,
          discovered:
            discovery.urls.length,
          urls:
            discovery.urls,
          diagnostics:
            discovery.diagnostics
        }
      );

      attempts.push({
        url:
          landingUrl,

        outcome:
          "DISCOVERY",

        acquisition:
          discovery.method,

        discovered:
          discovery.urls.length,

        diagnostics:
          discovery.diagnostics
      });


      for (const url of discovery.urls) {
        if (!articleSeen.has(url)) {
          articleSeen.add(url);
          articleUrls.push(url);

          discoveryProvenance.set(
            url,
            {
              landingUrl,
              method:
                discovery.method
            }
          );
        }
      }

      /*
       * One semantic landing discovery should return all
       * today's relevant article URLs (schema allows up
       * to 12). Once it succeeds, immediately move to
       * article extraction instead of burning multiple
       * Browser Run chains on duplicate entry pages.
       */
      if (discovery.urls.length > 0) {
        break;
      }

    } catch (error) {
      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "DISCOVERY_FAILED",
        landingUrl,
        {
          error:
            errorMessage(error)
        }
      );

      attempts.push({
        url:
          landingUrl,

        outcome:
          "DISCOVERY_FAILED",

        error:
          errorMessage(error)
      });
    }
  }


  /*
   * A successfully discovered article is authoritative
   * for this refresh attempt.
   *
   * Once article discovery succeeded, do NOT feed
   * landing/index/homepage URLs into article extraction.
   *
   * Direct landing extraction remains only when
   * discovery found no article at all, because some
   * sources may publish picks directly on an entry page.
   */
  const urls =
    articleUrls.length > 0
      ? [
          ...articleUrls
        ]
      : [
          ...landingUrls
        ];


  /*
   * Every discovered article URL is then passed into
   * the EXISTING extraction fallback.
   */
  for (const url of urls) {
    try {
      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "EXTRACTION_START",
        url,
        {
          provenance:
            discoveryProvenance.get(url) ??
            null,
          isLandingUrl:
            landingUrls.includes(url)
        }
      );

      const fingerprint =
        await expertHttpFingerprint(
          url
        );


      /*
       * Fingerprint is optimization only.
       * HTTP failure does not block Browser extraction.
       */
      if (
        !force &&
        currentRowsExist &&
        source.last_working_url === url &&
        fingerprint &&
        source.content_hash ===
          fingerprint.hash
      ) {
        return {
          source:
            source.source_key,

          status:
            "unchanged",

          count:0,

          workingUrl:
            url,

          attempts
        } as ExpertRefreshResult;
      }


      const extracted =
        await extractExperts(
          env,
          url,
          source.source_name
        );


      hadSemanticSuccess = true;


      const provenance =
        discoveryProvenance.get(
          url
        );

      const isLandingUrl =
        landingUrls.includes(url);

      /*
       * Attempt-level provenance belongs to refreshTrace.
       *
       * Durable source_registry last_* fields are written
       * ONLY after CURRENT canonical validation succeeds.
       * This prevents empty or invalid reads from replacing
       * the last verified source provenance.
       */


      const rawPicks =
        extracted.extraction.picks;

      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "EXTRACTION_RESULT",
        url,
        {
          method:
            extracted.method,
          extracted:
            rawPicks.length,
          provenance:
            provenance ?? null,
          diagnostics:
            extracted.diagnostics
        }
      );


      if (!rawPicks.length) {
        attempts.push({
          url,
          acquisition:
            extracted.method,

          extracted:0,
          validated:0,

          outcome:
            "NO_CURRENT_CARD",

          diagnostics:
            extracted.diagnostics
        });

        /*
         * This URL may be homepage/archive with no
         * useful current picks. Try next candidate.
         */
        continue;
      }


      const validPicks =
        await validateExpertPicks(
          env,
          rawPicks
        );

      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "VALIDATION_RESULT",
        url,
        {
          extracted:
            rawPicks.length,
          validated:
            validPicks.length,
          method:
            extracted.method
        }
      );


      attempts.push({
        url,
        acquisition:
          extracted.method,

        extracted:
          rawPicks.length,

        validated:
          validPicks.length,

        outcome:
          validPicks.length
            ? "CANONICAL_MATCH"
            : "NO_CANONICAL_MATCH"
      });


      /*
       * Non-empty extraction but zero canonical matches:
       * wrong date/city/card/runner -> never persist.
       */
      if (!validPicks.length) {
        continue;
      }


      const contentHash =
        fingerprint?.hash ??
        await extractionHash(
          rawPicks
        );


      await persistExpertPicks(
        env,
        source.source_key,
        contentHash,
        validPicks
      );


      /*
       * Only a URL that produced CURRENT canonical picks
       * becomes last_working_url.
       */
      const successfulDiscoveredFromUrl =
        provenance?.landingUrl ??
        (
          isLandingUrl
            ? url
            : null
        );


      const successfulDiscoveryMethod =
        provenance?.method ??
        (
          isLandingUrl
            ? "direct-landing"
            : null
        );


      await markExpertHealthy(
        env,
        source.source_key,
        contentHash,
        url,
        {
          discoveredFromUrl:
            successfulDiscoveredFromUrl,

          discoveryMethod:
            successfulDiscoveryMethod,

          extractionMethod:
            extracted.method
        }
      );


      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "SUCCESS",
        url,
        {
          workingUrl:
            url,

          discoveredFromUrl:
            successfulDiscoveredFromUrl,

          discoveryMethod:
            successfulDiscoveryMethod,

          extractionMethod:
            extracted.method,

          extracted:
            rawPicks.length,

          validated:
            validPicks.length,

          persisted:
            validPicks.length,

          cached:
            false
        }
      );


      return {
        source:
          source.source_key,

        status:
          "updated",

        count:
          validPicks.length,

        extractionMethod:
          extracted.method,

        workingUrl:
          url,

        attempts
      } as ExpertRefreshResult;

    } catch (error) {
      lastError = error;

      await recordExpertRefreshTrace(
        env,
        source.source_key,
        "EXTRACTION_FAILED",
        url,
        {
          error:
            errorMessage(error)
        }
      );

      attempts.push({
        url,
        outcome:
          "ACQUISITION_OR_EXTRACTION_FAILED",

        error:
          errorMessage(error)
      });

      /*
       * Try next semantic URL candidate.
       */
      continue;
    }
  }


  if (hadSemanticSuccess) {
    await recordExpertRefreshTrace(
      env,
      source.source_key,
      "NO_CURRENT_CARD",
      null,
      {
        attempts
      }
    );

    return {
      source:
        source.source_key,

      status:
        "no-current-card",

      count:0,

      attempts
    } as ExpertRefreshResult;
  }


  throw new Error(
    `EXPERT_ALL_URLS_FAILED:` +
    `${source.source_key}:` +
    errorMessage(lastError)
  );
}


export async function refreshExpertsIfDue(
  env:Env,
  force=false
):Promise<any> {
  const minutes =
    await nextRaceMinutes(env);

  const interval =
    expertCheckIntervalMs(minutes);


  if (interval === null) {
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
      Date.parse(state.checked)
    ) < interval
  ) {
    return {
      refreshed:false,
      reason:"fresh",
      nextRaceMinutes:
        minutes
    };
  }


  const sources =
    await activeExpertSources(env);


  const results =
    await mapLimit(
      sources,
      3,

      async source => {
        try {
          return await processSource(
            env,
            source,
            force
          );

        } catch (error) {
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
              errorMessage(error)
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


/*
 * Admin/diagnostic source-isolated refresh.
 *
 * This intentionally runs exactly ONE enabled source,
 * so discovery + CF semantic acquisition + canonical
 * validation can be diagnosed without an 8-source
 * long-running HTTP request.
 */
export async function refreshExpertSource(
  env: Env,
  sourceKey: string
): Promise<any> {
  const key =
    String(sourceKey ?? "")
      .trim();

  if (!key) {
    throw new Error(
      "EXPERT_SOURCE_REQUIRED"
    );
  }

  const sources =
    await activeExpertSources(
      env
    );

  const source =
    sources.find(
      item =>
        item.source_key === key
    );

  if (!source) {
    throw new Error(
      `EXPERT_SOURCE_NOT_FOUND:${key}`
    );
  }

  const startedAt =
    new Date().toISOString();

  await recordExpertRefreshTrace(
    env,
    key,
    "REFRESH_START",
    null,
    null,
    startedAt
  );

  try {
    const result =
      await processSource(
        env,
        source,
        true
      );

    await recordExpertRefreshTrace(
      env,
      key,
      "REFRESH_COMPLETE",
      (result as any).workingUrl ?? null,
      {
        result
      },
      startedAt
    );

    return {
      source:
        key,

      ok:
        result.status !==
          "failed",

      result
    };

  } catch (error) {
    await markExpertFailure(
      env,
      key
    );

    await recordExpertRefreshTrace(
      env,
      key,
      "REFRESH_FAILED",
      null,
      {
        error:
          errorMessage(error)
      },
      startedAt
    );

    return {
      source:
        key,

      ok:false,

      result:{
        source:
          key,

        status:
          "failed",

        error:
          errorMessage(error)
      }
    };
  }
}
