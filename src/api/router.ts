import type { Env } from "../env";
import { json, errorMessage, turkeyDate } from "../shared";
import { getToday } from "../storage/program-repository";
import { toPublicMeetings, toPublicHistory } from "./public-projection";
import { refreshProgramIfDue } from "../tjk/program-service";
import {
  refreshExpertsIfDue,
  refreshExpertSource
} from "../experts/service";

import {
  previewExpertSource
} from "../experts/preview";
import {
  summarizeExpertSourceHealth
} from "../experts/source-repository";
import { getHistory } from "../history/service";
import { refreshHorseForms } from "../form/service";
import { refreshFieldSignalsIfDue } from "../field/service";
import { generateSixFoldCoupons } from "../coupons/service";
import { adminAuthFailure } from "./auth";
import { logger } from "../observability/logger";
import { systemDiagnosticResponse } from "./system-diagnostics";
import {
  ingestOfficialResultsDue,
  backfillLearningLabels
} from "../results/runtime";
import { ingestOfficialResults } from "../results/service";
import { buildOfficialResultsUrl } from "../results/url";
import { repairHistoricalDates } from "../results/historical-date-repair";
import { getHorseVideos } from "../horses/service";

export async function route(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const url=new URL(request.url);
 if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS","access-control-allow-headers":"authorization,x-admin-token,content-type"}});

 const authFailure=adminAuthFailure(request,env);
 if(authFailure) return authFailure;

 logger.debug(
  env,
  "http.request",
  {
   method:request.method,
   route:url.pathname,
   cfRay:request.headers.get("cf-ray")
  }
 );

 if(url.pathname==="/api/health") return json({ok:true,app:env.APP_NAME,version:env.APP_VERSION,timestamp:new Date().toISOString()});
 if(url.pathname==="/api/today") {
  const meetings=await getToday(env);
  if(meetings.length===0) ctx.waitUntil(refreshProgramIfDue(env).catch(console.error));
  else { ctx.waitUntil(refreshProgramIfDue(env).catch(console.error)); ctx.waitUntil(refreshExpertsIfDue(env).catch(console.error)); }
  return json({date:turkeyDate(),meetings:toPublicMeetings(meetings),servedFrom:"d1",refreshingInBackground:true});
 }
 if(url.pathname==="/api/horses/videos") {
  const raceDate=url.searchParams.get("raceDate") ?? turkeyDate();
  const city=url.searchParams.get("city");
  const raceNumber=Number(url.searchParams.get("raceNumber"));
  const horseNumber=Number(url.searchParams.get("horseNumber"));
  if(!city || !Number.isInteger(raceNumber) || raceNumber<=0 || !Number.isInteger(horseNumber) || horseNumber<=0) {
   return json({error:"INVALID_PARAMS"},400);
  }
  const result=await getHorseVideos(env,raceDate,city,raceNumber,horseNumber);
  if("error" in result) return json(result,404);
  return json(result);
 }
 if(url.pathname==="/api/coupons/generate") {
  try {
   let city=
    url.searchParams.get(
     "city"
    ) ?? "";

   let budgetTl=
    Number(
     url.searchParams.get(
      "budgetTl"
     )
    );

   let sixfold=
    Number(
     url.searchParams.get(
      "sixfold"
     ) ?? "1"
    );

   let multiplier=
    Number(
     url.searchParams.get(
      "multiplier"
     ) ?? "1"
    );

   if(
    request.method==="POST"
   ) {
    const body=
     await request
      .json<any>();

    city=
     String(
      body?.city ??
      city
     );

    budgetTl=
     Number(
      body?.budgetTl ??
      budgetTl
     );

    sixfold=
     Number(
      body?.sixfold ??
      sixfold
     );

    multiplier=
     Number(
      body?.multiplier ??
      multiplier
     );
   }

   if(
    !city.trim()
   ) {
    return json({
     ok:false,
     error:"CITY_REQUIRED"
    },400);
   }

   if(
    !Number.isFinite(
     budgetTl
    ) ||
    budgetTl<=0
   ) {
    return json({
     ok:false,
     error:"VALID_BUDGET_REQUIRED"
    },400);
   }

   const result=
    await generateSixFoldCoupons(
     env,
     {
      city,
      budgetTl,
      sixfold,
      multiplier,
      persistSnapshot:
       request.method==="POST"
     }
    );

   return json({
    ok:true,
    ...result
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },400);
  }
 }

 if(url.pathname==="/api/history") {
  const limit=Math.max(1,Math.min(50,Math.floor(Number(url.searchParams.get("limit"))||20)));
  const offset=Math.max(0,Math.floor(Number(url.searchParams.get("offset"))||0));
  const {entries,total}=await getHistory(env,{limit,offset});
  return json({history:toPublicHistory(entries),total,limit,offset});
 }
 if(url.pathname==="/api/admin/repair-historical-dates" && request.method==="POST") {
  try {
   const body = await request.json<any>();
   const repair = await repairHistoricalDates(env,{
    mappings:Array.isArray(body?.mappings) ? body.mappings : [],
    apply:body?.apply === true
   });
   return json(repair,repair.ok ? 200 : 409);
  } catch(e) {
   return json({ok:false,error:errorMessage(e)},400);
  }
 }

 if(url.pathname==="/api/admin/backfill-learning-labels" && request.method==="POST") {
  try {
   const requestedLimit =
    Number(
     url.searchParams.get(
      "limit"
     ) ?? "5"
    );

   const backfill =
    await backfillLearningLabels(
     env,
     {
      limit:
       requestedLimit
     }
    );

   return json({
    ok:
     backfill.failedMeetings === 0,

    backfill
   });
  } catch(e) {
   return json({
    ok:false,
    error:
     errorMessage(e)
   },500);
  }
 }

 if(url.pathname==="/api/admin/refresh-results" && request.method==="POST") {
  try {
   const date =
    url.searchParams.get("date");

   const city =
    url.searchParams.get("city");

   if(date || city) {
    if(!date || !city) {
     return json({
      ok:false,
      error:"DATE_AND_CITY_REQUIRED"
     },400);
    }

    const result =
     await ingestOfficialResults(
      env,
      {
       raceDate:date,
       city,
       url:
        buildOfficialResultsUrl(
         date,
         city
        )
      }
     );

    return json({
     ok:true,
     forced:true,
     date,
     city,
     result
    });
   }

   const results =
    await ingestOfficialResultsDue(
     env
    );

   return json({
    ok:true,
    forced:false,
    results
   });
  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },502);
  }
 }

 if(url.pathname==="/api/admin/refresh-tjk" && request.method==="POST") {
        try {
            const program = await refreshProgramIfDue(env, true);
            return json({ ok:true, program });
        } catch (error) {
            return json({
                ok:false,
                error:error instanceof Error ? error.message : String(error)
            }, 500);
        }
    }

    if(url.pathname==="/api/admin/refresh-experts" && request.method==="POST") {
  try {
    const experts =
      await refreshExpertsIfDue(
        env,
        true
      );

    return json({
      ok:true,
      experts
    });
  } catch(e) {
    return json({
      ok:false,
      error:errorMessage(e)
    },502);
  }
 }

 if(
  url.pathname==="/api/admin/refresh-expert-source" &&
  request.method==="POST"
 ) {
  try {
   const source =
    (
     url.searchParams.get("source") ??
     ""
    ).trim();

   if(!source) {
    return json({
     ok:false,
     error:"EXPERT_SOURCE_REQUIRED"
    },400);
   }

   /*
    * Do NOT keep the HTTP connection open while
    * Browser Run discovery/extraction executes.
    *
    * The source job continues under waitUntil and
    * this endpoint returns immediately.
    */
   ctx.waitUntil(
    refreshExpertSource(
     env,
     source
    ).catch(error => {
     console.error(
      "expert-source-refresh",
      source,
      error
     );
    })
   );

   return json({
    ok:true,
    accepted:true,
    source
   },202);

  } catch(e) {
   return json({
    ok:false,
    error:
     errorMessage(e)
   },400);
  }
 }


 /*
  * ADMIN READ-ONLY EXPERT PREVIEW
  *
  * Source-specific discovery is performed inside
  * previewExpertSource().
  *
  * No prediction persistence.
  * No source-health mutation.
  * No refresh-trace mutation.
  * No normal no-upcoming-race policy change.
  */
 if(
  url.pathname==="/api/admin/preview-expert-source" &&
  request.method==="POST"
 ) {
  try {
   const sourceKey =
    (
     url.searchParams.get("source") ??
     ""
    ).trim();


   if(!sourceKey) {
    return json({
     ok:false,
     preview:true,
     persisted:false,
     error:"EXPERT_SOURCE_REQUIRED"
    },400);
   }


   const previewDate =
    (
     url.searchParams.get("date") ??
     ""
    ).trim() || undefined;


   const preview =
    await previewExpertSource(
     env,
     sourceKey,
     previewDate
    );


   return json(
    preview,
    preview.ok
     ? 200
     : 422
   );

  } catch(e) {
   return json({
    ok:false,
    preview:true,
    persisted:false,
    error:
     errorMessage(e)
   },422);
  }
 }


    if(url.pathname==="/api/admin/refresh-field" && request.method==="POST") {
  try {
    await refreshFieldSignalsIfDue(
      env
    );

    return json({
      ok:true,
      field:{
        triggered:true
      }
    });
  } catch(e) {
    return json({
      ok:false,
      error:errorMessage(e)
    },502);
  }
 }

    if(url.pathname==="/api/admin/refresh-form" && request.method==="POST") {
  try {
    const forms =
      await refreshHorseForms(
        env,
        true
      );

    return json({
      ok:true,
      forms
    });
  } catch(e) {
    return json({
      ok:false,
      error:errorMessage(e)
    },502);
  }
 }
 if(url.pathname==="/api/admin/refresh" && request.method==="POST") {
  try {
   const program=
    await refreshProgramIfDue(
     env,
     true
    );

   const experts=
    await refreshExpertsIfDue(
     env,
     true
    );

   /*
    * Field has its own candidate/retry policy.
    * Admin force refresh must exercise it too.
    */
   await refreshFieldSignalsIfDue(
    env
   );

   return json({
    ok:true,
    program,
    experts,
    field:{
     triggered:true
    }
   });
  }
  catch(e){
   return json({
    ok:false,
    error:errorMessage(e)
   },502);
  }
 }
 const systemDiagnostic=
  await systemDiagnosticResponse(
   request,
   env
  );

 if(systemDiagnostic) {
  return systemDiagnostic;
 }

 if(url.pathname==="/api/debug/sixfold") {
  try {
   const windows=
    await env.DB.prepare(`
     SELECT *
     FROM sixfold_windows
     ORDER BY
      race_date DESC,
      city,
      sixfold_number
     LIMIT 50
    `).all();

   const coupons=
    await env.DB.prepare(`
     SELECT
      race_date,
      city,
      sixfold_number,
      profile,
      budget_tl,
      total_tl,
      combinations,
      generated_at,
      evaluated_at,
      hit_legs,
      six_of_six,
      five_of_six

     FROM sixfold_coupon_snapshots

     ORDER BY
      generated_at DESC

     LIMIT 100
    `).all();

   return json({
    ok:true,
    windows:
     windows.results,
    coupons:
     coupons.results
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },500);
  }
 }

 if(url.pathname==="/api/debug/expert-source") {
  try {
   const source =
    (
     url.searchParams.get("source") ??
     ""
    ).trim();

   if(!source) {
    return json({
     ok:false,
     error:"EXPERT_SOURCE_REQUIRED"
    },400);
   }

   const state =
    await env.DB.prepare(`
     SELECT
      source_key,
      source_name,
      homepage_url,
      last_working_url,
      last_discovered_article_url,
      last_discovered_article_at,
      last_discovered_from_url,
      last_discovery_method,
      last_extraction_method,
      health_status,
      last_checked_at,
      last_success_at,
      last_failure_at,
      consecutive_failures,
      content_hash
     FROM source_registry
     WHERE source_key = ?
     LIMIT 1
    `)
     .bind(source)
     .first<any>();

   if(!state) {
    return json({
     ok:false,
     error:"EXPERT_SOURCE_NOT_FOUND"
    },404);
   }

   const trace =
    await env.DB.prepare(`
     SELECT
      source_key,
      phase,
      current_url,
      details_json,
      started_at,
      updated_at
     FROM expert_source_refresh_trace
     WHERE source_key = ?
     LIMIT 1
    `)
     .bind(source)
     .first<any>();

   const today =
    turkeyDate();

   const totals =
    await env.DB.prepare(`
     SELECT
      COUNT(*) AS predictions,
      COUNT(DISTINCT city) AS cities,
      COUNT(
       DISTINCT city || '|' || race_number
      ) AS races
     FROM expert_predictions
     WHERE race_date = ?
       AND source_key = ?
    `)
     .bind(
      today,
      source
     )
     .first<any>();

   const coverage =
    await env.DB.prepare(`
     SELECT
      city,
      COUNT(DISTINCT race_number) AS races,
      COUNT(*) AS predictions
     FROM expert_predictions
     WHERE race_date = ?
       AND source_key = ?
     GROUP BY city
     ORDER BY city
    `)
     .bind(
      today,
      source
     )
     .all<any>();

   const samples =
    await env.DB.prepare(`
     SELECT
      city,
      race_number,
      horse_number,
      horse_name,
      comment,
      is_favorite,
      is_banko,
      is_strong,
      is_star,
      is_rival,
      is_surprise,
      is_avoid,
      confidence,
      updated_at
     FROM expert_predictions
     WHERE race_date = ?
       AND source_key = ?
     ORDER BY
      city,
      race_number,
      horse_number
     LIMIT 30
    `)
     .bind(
      today,
      source
     )
     .all<any>();

   return json({
    ok:true,
    date:today,
    source:state,
    refreshTrace:
     trace
      ? {
         source_key:
          trace.source_key,
         phase:
          trace.phase,
         current_url:
          trace.current_url,
         details:
          trace.details_json
           ? (() => {
              try {
               return JSON.parse(
                trace.details_json
               );
              } catch {
               return {
                raw:
                 trace.details_json
               };
              }
             })()
           : null,
         started_at:
          trace.started_at,
         updated_at:
          trace.updated_at
        }
      : null,
    totals:{
     predictions:
      Number(
       totals?.predictions ?? 0
      ),
     cities:
      Number(
       totals?.cities ?? 0
      ),
     races:
      Number(
       totals?.races ?? 0
      )
    },
    coverage:
     coverage.results ?? [],
    samples:
     samples.results ?? []
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },500);
  }
 }

 if(url.pathname==="/api/debug/sources") {
  const sources=await env.DB.prepare(`
 SELECT
   source_key,
   source_name,
   domain,
   source_type,
   base_weight,
   enabled,
   health_status,
   last_checked_at,
   last_success_at,
   last_failure_at,
   consecutive_failures,
   content_hash
 FROM source_registry
 ORDER BY enabled DESC, source_name
`).all();

  const health=await summarizeExpertSourceHealth(env);
  const healthBySource=new Map(health.sources.map(row=>[row.sourceKey,row]));

  const enriched=(sources.results as any[]).map(row=>{
   const derived=healthBySource.get(String(row.source_key));
   return {
    ...row,
    effectiveStatus:derived?.effectiveStatus ?? row.health_status,
    contributingToday:derived?.contributingToday ?? false
   };
  });

  return json({
   ok:true,
   count:enriched.length,
   summary:{
    availableSources:health.availableSources,
    contributingSources:health.contributingSources,
    staleSources:health.staleSources,
    failedSources:health.failedSources
   },
   sources:enriched
  });
 }
 if(url.pathname==="/api/debug/learning-labels") {
  try {
   const races =
    await env.DB.prepare(`
     SELECT
      COUNT(*) AS total,

      SUM(
       CASE
        WHEN labelled_at IS NOT NULL
        THEN 1 ELSE 0
       END
      ) AS labelled,

      SUM(
       CASE
        WHEN labelled_at IS NULL
        THEN 1 ELSE 0
       END
      ) AS pending

     FROM learning_races
    `).first<any>();

   const runners =
    await env.DB.prepare(`
     SELECT
      COUNT(*) AS total,

      SUM(
       CASE
        WHEN finish_position IS NOT NULL
        THEN 1 ELSE 0
       END
      ) AS labelled,

      SUM(
       CASE
        WHEN finish_position IS NULL
        THEN 1 ELSE 0
       END
      ) AS pending

     FROM learning_runner_features
    `).first<any>();

   const audits =
    await env.DB.prepare(`
     SELECT
      reason,
      COUNT(*) AS count,
      MAX(attempted_at) AS latest_attempt

     FROM learning_label_audit

     GROUP BY reason

     ORDER BY count DESC
    `).all<any>();

   const pendingMeetings =
    await env.DB.prepare(`
     SELECT
      race_date,
      city,
      COUNT(*) AS pending_races,
      MIN(starts_at) AS first_start,
      MAX(starts_at) AS last_start

     FROM learning_races

     WHERE labelled_at IS NULL

     GROUP BY
      race_date,
      city

     ORDER BY
      race_date ASC,
      city ASC

     LIMIT 50
    `).all<any>();

   return json({
    ok:true,

    races:{
     total:
      Number(
       races?.total ?? 0
      ),

     labelled:
      Number(
       races?.labelled ?? 0
      ),

     pending:
      Number(
       races?.pending ?? 0
      )
    },

    runners:{
     total:
      Number(
       runners?.total ?? 0
      ),

     labelled:
      Number(
       runners?.labelled ?? 0
      ),

     pending:
      Number(
       runners?.pending ?? 0
      )
    },

    skipReasons:
     audits.results ?? [],

    pendingMeetings:
     pendingMeetings.results ?? []
   });
  } catch(e) {
   return json({
    ok:false,
    error:
     errorMessage(e)
   },500);
  }
 }

 if(url.pathname==="/api/debug/learning") {
  try {
   const state=await env.DB.prepare(`
    SELECT
      evaluated_races,
      base_top1_rate,
      learned_top1_rate,
      base_top3_rate,
      learned_top3_rate,
      base_mean_winner_rank,
      learned_mean_winner_rank,
      learning_scale,
      status,
      updated_at
    FROM learning_model_state
    WHERE id=1
   `).first<any>();

   const samples=await env.DB.prepare(`
    SELECT
      COUNT(
        DISTINCT race_date || '|' ||
        city || '|' || race_number
      ) AS labelled_races,
      COUNT(*) AS labelled_runners,
      MAX(race_date) AS latest_label_date
    FROM learning_runner_features
    WHERE finish_position IS NOT NULL
   `).first<any>();

   const numberOrNull=(value:any)=>
     value == null ? null : Number(value);

   const baseTop1=
     numberOrNull(state?.base_top1_rate);
   const learnedTop1=
     numberOrNull(state?.learned_top1_rate);

   const baseTop3=
     numberOrNull(state?.base_top3_rate);
   const learnedTop3=
     numberOrNull(state?.learned_top3_rate);

   const baseRank=
     numberOrNull(state?.base_mean_winner_rank);
   const learnedRank=
     numberOrNull(state?.learned_mean_winner_rank);

   return json({
    ok:true,

    gate:{
     status:
      state?.status ??
      "insufficient-data",

     evaluatedRaces:
      Number(
       state?.evaluated_races ??
       0
      ),

     minimumEvaluationRaces:100,

     learningScale:
      Math.max(
       0,
       Math.min(
        1,
        Number(
         state?.learning_scale ??
         1
        )
       )
      ),

     updatedAt:
      state?.updated_at ??
      null
    },

    performance:{
     base:{
      top1Rate:baseTop1,
      top3Rate:baseTop3,
      meanWinnerRank:baseRank
     },

     learned:{
      top1Rate:learnedTop1,
      top3Rate:learnedTop3,
      meanWinnerRank:learnedRank
     },

     delta:{
      top1Rate:
       baseTop1 == null ||
       learnedTop1 == null
        ? null
        : learnedTop1-baseTop1,

      top3Rate:
       baseTop3 == null ||
       learnedTop3 == null
        ? null
        : learnedTop3-baseTop3,

      meanWinnerRankGain:
       baseRank == null ||
       learnedRank == null
        ? null
        : baseRank-learnedRank
     }
    },

    samples:{
     labelledRaces:
      Number(
       samples?.labelled_races ??
       0
      ),

     labelledRunners:
      Number(
       samples?.labelled_runners ??
       0
      ),

     latestLabelDate:
      samples?.latest_label_date ??
      null
    }
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },500);
  }
 }


 if(url.pathname==="/api/debug/learning-pipeline") {
  try {
   const races=await env.DB.prepare(`
    SELECT
     COUNT(*) total,
     SUM(CASE WHEN labelled_at IS NOT NULL THEN 1 ELSE 0 END) labelled,
     MIN(race_date) first_date,
     MAX(race_date) last_date
    FROM learning_races
   `).first<any>();

   const runners=await env.DB.prepare(`
    SELECT
     COUNT(*) total,
     SUM(CASE WHEN finish_position IS NOT NULL THEN 1 ELSE 0 END) labelled,
     SUM(CASE WHEN model_score IS NOT NULL THEN 1 ELSE 0 END) scored
    FROM learning_runner_features
   `).first<any>();

   const candidates=await env.DB.prepare(`
    SELECT
     COUNT(*) total,

     SUM(
      CASE
       WHEN starts_at <= ?
        AND captured_at < starts_at
       THEN 1
       ELSE 0
      END
     ) eligible_for_promotion,

     SUM(
      CASE
       WHEN captured_at >= starts_at
       THEN 1
       ELSE 0
      END
     ) invalid_capture_timing,

     MIN(starts_at) earliest_start,
     MAX(starts_at) latest_start,
     MAX(captured_at) latest_capture

    FROM learning_snapshot_candidates
   `)
    .bind(
     new Date().toISOString()
    )
    .first<any>();

   const candidateExamples=await env.DB.prepare(`
    SELECT
     race_date,
     city,
     race_number,
     starts_at,
     captured_at,

     CASE
      WHEN starts_at <= ?
       AND captured_at < starts_at
      THEN 1
      ELSE 0
     END eligible_for_promotion

    FROM learning_snapshot_candidates

    ORDER BY starts_at
    LIMIT 20
   `)
    .bind(
     new Date().toISOString()
    )
    .all();

   const results=await env.DB.prepare(`
    SELECT
     race_date,
     city,
     status,
     method,
     last_attempt_at,
     last_success_at,
     detail
    FROM official_result_runs
    ORDER BY last_attempt_at DESC
    LIMIT 20
   `).all();

   const unlabelled=await env.DB.prepare(`
    SELECT
     race_date,
     city,
     race_number,
     starts_at,
     snapshot_at
    FROM learning_races
    WHERE labelled_at IS NULL
      AND starts_at IS NOT NULL
      AND starts_at < datetime('now')
    ORDER BY starts_at DESC
    LIMIT 20
   `).all();

   const recent=await env.DB.prepare(`
    SELECT
     race_date,
     city,
     race_number,
     starts_at,
     snapshot_at,
     labelled_at
    FROM learning_races
    ORDER BY race_date DESC, starts_at DESC
    LIMIT 20
   `).all();

   return json({
    ok:true,
    races,
    runners,
    snapshotCandidates:{
     total:Number(candidates?.total ?? 0),

     eligibleForPromotion:
      Number(
       candidates?.eligible_for_promotion ??
       0
      ),

     invalidCaptureTiming:
      Number(
       candidates?.invalid_capture_timing ??
       0
      ),

     earliestStart:
      candidates?.earliest_start ??
      null,

     latestStart:
      candidates?.latest_start ??
      null,

     latestCapture:
      candidates?.latest_capture ??
      null
    },

    candidateExamples:
     candidateExamples.results,

    serverNow:
     new Date().toISOString(),

    officialResultRuns:results.results,
    startedButUnlabelled:unlabelled.results,
    recentLearningRaces:recent.results
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },500);
  }
 }


 if(url.pathname==="/api/debug/model") {
  try {
   const state=
    await env.DB.prepare(`
     SELECT *
     FROM learning_model_state
     WHERE id=1
    `).first<any>();

   const advanced=
    await env.DB.prepare(`
     SELECT *
     FROM learning_advanced_metrics
     WHERE id=1
    `).first<any>();

   const expert=
    await env.DB.prepare(`
     SELECT
      source_key,
      sample_size,
      winner_hit_rate,
      top3_hit_rate,
      multiplier,
      updated_at
     FROM expert_learning_priors
     ORDER BY
      sample_size DESC,
      source_key
    `).all<any>();

   const categories=
    await env.DB.prepare(`
     SELECT
      source_key,
      category,
      sample_size,
      winner_hit_rate,
      top3_hit_rate,
      multiplier,
      updated_at
     FROM expert_category_priors
     ORDER BY
      source_key,
      category
    `).all<any>();

   const context=
    await env.DB.prepare(`
     SELECT
      entity_type,
      COUNT(*) prior_count,
      SUM(sample_size) total_samples,
      MAX(sample_size) max_samples
     FROM learning_context_priors
     GROUP BY entity_type
     ORDER BY entity_type
    `).all<any>();

   const couponMetrics=
    await env.DB.prepare(`
     SELECT
      mode,
      evaluated_races,
      winner_covered_races,
      hit_rate,
      avg_selection_count,
      updated_at
     FROM coupon_strategy_metrics
     ORDER BY mode
    `).all<any>();

   const labelAudit=
    await env.DB.prepare(`
     SELECT
      reason,
      COUNT(*) count,
      MAX(attempted_at)
        last_seen_at
     FROM learning_label_audit
     GROUP BY reason
     ORDER BY count DESC
    `).all<any>();

   const sourceHealth=
    await env.DB.prepare(`
     SELECT
      source_key,
      source_name,
      health_status,
      enabled,
      consecutive_failures,
      last_success_at,
      last_failure_at
     FROM source_registry
     ORDER BY
      enabled DESC,
      source_name
    `).all<any>();

   return json({
    ok:true,

    learningGate:
     state == null
      ? null
      : {
         ...state,

         productionLearningEnabled:
          Number(
           state.learning_scale ??
           0
          ) > 0,

         evaluationMode:
          Number(
           state.evaluated_races ??
           0
          ) < 100
           ? "shadow"
           : "gated-production"
        },

    advancedEvaluation:
     advanced ?? null,

    contextPriors:
     context.results,

    expertSources:
     expert.results,

    expertCategories:
     categories.results,

    couponMetrics:
     couponMetrics.results,

    labelAudit:
     labelAudit.results,

    sourceHealth:
     sourceHealth.results
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },500);
  }
 }


 if(url.pathname==="/api/debug/coverage") {
  try {
   const date =
    turkeyDate();

   const runnerCoverage=
    await env.DB.prepare(`
     SELECT
      r.city,
      r.race_number,

      COUNT(*) runner_count,

      SUM(
       CASE
        WHEN r.agf_percent IS NOT NULL
        THEN 1 ELSE 0
       END
      ) agf_count,

      SUM(
       CASE
        WHEN r.recent_form_raw IS NOT NULL
         AND TRIM(r.recent_form_raw) <> ''
        THEN 1 ELSE 0
       END
      ) form_count,

      SUM(
       CASE
        WHEN EXISTS(
         SELECT 1
         FROM expert_predictions ep
         JOIN source_registry sr
          ON sr.source_key =
             ep.source_key

         WHERE
          ep.race_date =
           r.race_date
          AND ep.city =
           r.city
          AND ep.race_number =
           r.race_number
          AND ep.horse_number =
           r.horse_number
          AND sr.enabled = 1
        )
        THEN 1 ELSE 0
       END
      ) expert_runner_count,

      SUM(
       CASE
        WHEN EXISTS(
         SELECT 1
         FROM agf_market_snapshots ms
         WHERE
          ms.race_date =
           r.race_date
          AND ms.city =
           r.city
          AND ms.race_number =
           r.race_number
          AND ms.horse_number =
           r.horse_number
        )
        THEN 1 ELSE 0
       END
      ) market_runner_count,

      SUM(
       CASE
        WHEN EXISTS(
         SELECT 1
         FROM field_signals fs
         WHERE
          fs.race_date =
           r.race_date
          AND fs.city =
           r.city
          AND fs.race_number =
           r.race_number
          AND fs.horse_number =
           r.horse_number
          AND fs.tjk_score
              IS NOT NULL
        )
        THEN 1 ELSE 0
       END
      ) field_runner_count

     FROM runners r

     WHERE
      r.race_date = ?

     GROUP BY
      r.city,
      r.race_number

     ORDER BY
      r.city,
      r.race_number
    `)
     .bind(date)
     .all<any>();


   const expertRows=
    await env.DB.prepare(`
     SELECT
      ep.city,
      ep.race_number,

      COUNT(*) prediction_rows,

      COUNT(
       DISTINCT ep.source_key
      ) source_count,

      COUNT(
       DISTINCT ep.horse_number
      ) horse_count

     FROM expert_predictions ep

     JOIN source_registry sr
      ON sr.source_key =
         ep.source_key

     WHERE
      ep.race_date = ?
      AND sr.enabled = 1

     GROUP BY
      ep.city,
      ep.race_number

     ORDER BY
      ep.city,
      ep.race_number
    `)
     .bind(date)
     .all<any>();


   const expertBySource=
    await env.DB.prepare(`
     SELECT
      ep.source_key,
      sr.source_name,

      COUNT(*) prediction_rows,

      COUNT(
       DISTINCT ep.city || '|' ||
       ep.race_number
      ) race_count,

      COUNT(
       DISTINCT ep.horse_number
      ) distinct_horse_numbers,

      MAX(ep.updated_at)
       latest_prediction

     FROM expert_predictions ep

     JOIN source_registry sr
      ON sr.source_key =
         ep.source_key

     WHERE
      ep.race_date = ?
      AND sr.enabled = 1

     GROUP BY
      ep.source_key,
      sr.source_name

     ORDER BY
      prediction_rows DESC
    `)
     .bind(date)
     .all<any>();


   const market=
    await env.DB.prepare(`
     SELECT
      city,
      race_number,

      COUNT(*) snapshot_rows,

      COUNT(
       DISTINCT horse_number
      ) horse_count,

      COUNT(
       DISTINCT captured_at
      ) capture_count,

      MIN(captured_at)
       first_capture,

      MAX(captured_at)
       latest_capture

     FROM agf_market_snapshots

     WHERE race_date = ?

     GROUP BY
      city,
      race_number

     ORDER BY
      city,
      race_number
    `)
     .bind(date)
     .all<any>();


   const field=
    await env.DB.prepare(`
     SELECT
      r.city,
      r.race_number,

      COUNT(fs.horse_number)
       signal_rows,

      SUM(
       CASE
        WHEN fs.tjk_score IS NOT NULL
        THEN 1 ELSE 0
       END
      ) scored_rows,

      MAX(frs.status)
       refresh_status,

      MAX(frs.acquisition_method)
       acquisition_method,

      MAX(frs.last_success_at)
       last_success_at,

      MAX(frs.last_attempt_at)
       last_attempt_at,

      MAX(frs.last_error)
       last_error

     FROM races r

     LEFT JOIN field_signals fs
      ON fs.race_date =
         r.race_date
      AND fs.city =
         r.city
      AND fs.race_number =
         r.race_number

     LEFT JOIN field_refresh_state frs
      ON frs.race_date =
         r.race_date
      AND frs.city =
         r.city
      AND frs.race_number =
         r.race_number

     WHERE
      r.race_date = ?

     GROUP BY
      r.city,
      r.race_number

     ORDER BY
      r.city,
      r.race_number
    `)
     .bind(date)
     .all<any>();


   const totals=
    await env.DB.prepare(`
     SELECT
      COUNT(*) total_runners,

      SUM(
       CASE
        WHEN agf_percent IS NOT NULL
        THEN 1 ELSE 0
       END
      ) agf_runners,

      SUM(
       CASE
        WHEN recent_form_raw IS NOT NULL
         AND TRIM(recent_form_raw) <> ''
        THEN 1 ELSE 0
       END
      ) form_runners

     FROM runners

     WHERE race_date = ?
    `)
     .bind(date)
     .first<any>();


   return json({
    ok:true,
    date,

    totals:{
     runners:
      Number(
       totals?.total_runners ??
       0
      ),

     agf:
      Number(
       totals?.agf_runners ??
       0
      ),

     form:
      Number(
       totals?.form_runners ??
       0
      )
    },

    runnerCoverage:
     runnerCoverage.results,

    expertRaces:
     expertRows.results,

    expertBySource:
     expertBySource.results,

    marketRaces:
     market.results,

    fieldRaces:
     field.results
   });

  } catch(e) {
   return json({
    ok:false,
    error:errorMessage(e)
   },500);
  }
 }

 if(url.pathname==="/api/debug/refresh-state") return json({states:(await env.DB.prepare("SELECT * FROM refresh_state ORDER BY pipeline_key").all()).results});
 return json({error:"not_found",path:url.pathname},404);
}
