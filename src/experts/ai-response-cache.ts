import type {
  Env
} from "../env";

import {
  isoNow,
  sha256
} from "../shared";


/*
 * Workers AI response cache.
 *
 * Workers AI neurons are the largest line on the Cloudflare bill.
 * Expert sources are re-checked many times a day and most checks
 * see byte-identical article text, so the same prompt was being
 * paid for again and again (live D1 showed the same mis-numbered
 * picks re-extracted 20+ times in one day).
 *
 * Every call that goes through here runs at temperature 0, so an
 * identical (model, input) pair normally produces the same answer
 * and reusing it skips the billed call. Workers AI can still drop
 * an item now and then; callers that detect an incomplete answer
 * retry with readCache:false, and that fresh answer replaces the
 * cached one.
 *
 * The cache is strictly best-effort. A D1 failure on read or write
 * falls through to a normal AI call and never fails extraction.
 */
export const AI_RESPONSE_CACHE_TTL_HOURS =
  36;


export async function aiResponseCacheKey(
  model:
    string,

  input:
    unknown
): Promise<string> {
  return sha256(
    JSON.stringify({
      model,
      input
    })
  );
}


export async function cachedAiRun(
  env:
    Env,

  model:
    string,

  input:
    Record<string, unknown>,

  /*
   * Only responses that pass this check are stored, so a
   * malformed/empty answer is retried on the next check rather
   * than pinned for 36 hours.
   */
  isCacheable:
    (raw: unknown) => boolean,

  options: {
    /*
     * false = skip the cache read and take a fresh sample, but
     * still store it. Used for completeness retries: Workers AI
     * can drop an item even at temperature 0, and a retry that
     * re-read the cached (incomplete) answer would never get its
     * independent second chance.
     */
    readCache?:
      boolean;
  } = {}
): Promise<{
  raw:
    any;

  cacheHit:
    boolean;
}> {
  const key =
    await aiResponseCacheKey(
      model,
      input
    );


  if (options.readCache !== false) {
    try {
      const row =
        await env.DB.prepare(`
          SELECT response_json
          FROM ai_response_cache
          WHERE cache_key = ?
            AND created_at >= ?
        `)
          .bind(
            key,
            new Date(
              Date.now() -
              AI_RESPONSE_CACHE_TTL_HOURS *
                60 * 60 * 1000
            ).toISOString()
          )
          .first<{
            response_json: string;
          }>();


      if (row?.response_json) {
        await env.DB.prepare(`
          UPDATE ai_response_cache
          SET hit_count = hit_count + 1
          WHERE cache_key = ?
        `)
          .bind(key)
          .run();

        return {
          raw:
            JSON.parse(
              row.response_json
            ),

          cacheHit:
            true
        };
      }
    } catch {
      // Cache unavailable: fall through to a real call.
    }
  }


  const raw =
    await env.AI.run(
      model as any,
      input as any
    );


  if (isCacheable(raw)) {
    try {
      await env.DB.prepare(`
        INSERT OR REPLACE INTO ai_response_cache(
          cache_key,
          model,
          response_json,
          created_at,
          hit_count
        )
        VALUES(?,?,?,?,0)
      `)
        .bind(
          key,
          model,
          JSON.stringify(raw),
          isoNow()
        )
        .run();
    } catch {
      // Best-effort only.
    }
  }


  return {
    raw,
    cacheHit:
      false
  };
}


export async function cleanupAiResponseCache(
  env:
    Env
): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM ai_response_cache
    WHERE created_at < ?
  `)
    .bind(
      new Date(
        Date.now() -
        AI_RESPONSE_CACHE_TTL_HOURS *
          60 * 60 * 1000
      ).toISOString()
    )
    .run();
}
