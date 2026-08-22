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
  markExpertProvenance
} from "./source-repository";

import {
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
  const landingUrls =
    expertUrlCandidates(source);


  if (!landingUrls.length) {
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


  const attempts:any[] = [];

  let hadSemanticSuccess = false;
  let lastError:unknown = null;


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
      const discovery =
        await discoverExpertArticleUrls(
          env,
          landingUrl,
          source.source_name,
          cities
        );


      attempts.push({
        url:
          landingUrl,

        outcome:
          "DISCOVERY",

        acquisition:
          discovery.method,

        discovered:
          discovery.urls.length
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

    } catch (error) {
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
   * Some sources publish directly on the landing URL,
   * so retain landing URLs as final fallback after
   * discovered article URLs.
   */
  const urls = [
    ...articleUrls,
    ...landingUrls.filter(
      url =>
        !articleSeen.has(url)
    )
  ];


  /*
   * Every discovered article URL is then passed into
   * the EXISTING extraction fallback.
   */
  for (const url of urls) {
    try {
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


      /*
       * Provenance is operational metadata, not a
       * prediction correctness decision.
       *
       * If we can semantically read the known working
       * article again, remember HOW it was discovered
       * and HOW it was extracted even if the article
       * no longer emits a current-card pick later in
       * the day.
       *
       * This must NOT bypass canonical validation.
       */
      if (
        provenance &&
        (
          url === source.last_working_url ||
          currentRowsExist
        )
      ) {
        await markExpertProvenance(
          env,
          source.source_key,
          {
            workingUrl:
              url === source.last_working_url
                ? url
                : null,

            discoveredFromUrl:
              provenance.landingUrl,

            discoveryMethod:
              provenance.method,

            extractionMethod:
              extracted.method
          }
        );
      }


      const rawPicks =
        extracted.extraction.picks;


      if (!rawPicks.length) {
        attempts.push({
          url,
          acquisition:
            extracted.method,

          extracted:0,
          validated:0,

          outcome:
            "NO_CURRENT_CARD"
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
      await markExpertHealthy(
        env,
        source.source_key,
        contentHash,
        url,
        {
          discoveredFromUrl:
            provenance?.landingUrl ??
            null,

          discoveryMethod:
            provenance?.method ??
            null,

          extractionMethod:
            extracted.method
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

  try {
    const result =
      await processSource(
        env,
        source,
        true
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
