import type { Env } from "../env";
import { json, errorMessage, turkeyDate } from "../shared";
import { getToday } from "../storage/program-repository";
import { refreshProgramIfDue } from "../tjk/program-service";
import { refreshExpertsIfDue } from "../experts/service";
import { getHistory } from "../history/service";
import { refreshHorseForms } from "../form/service";

export async function route(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
 const url=new URL(request.url);
 if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS"}});
 if(url.pathname==="/api/health") return json({ok:true,app:env.APP_NAME,version:env.APP_VERSION,timestamp:new Date().toISOString()});
 if(url.pathname==="/api/today") {
  const meetings=await getToday(env);
  if(meetings.length===0) ctx.waitUntil(refreshProgramIfDue(env).catch(console.error));
  else { ctx.waitUntil(refreshProgramIfDue(env).catch(console.error)); ctx.waitUntil(refreshExpertsIfDue(env).catch(console.error)); }
  return json({date:turkeyDate(),meetings,servedFrom:"d1",refreshingInBackground:true});
 }
 if(url.pathname==="/api/history") return json({history:await getHistory(env)});
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
  try { const program=await refreshProgramIfDue(env,true); const experts=await refreshExpertsIfDue(env,true); return json({ok:true,program,experts}); }
  catch(e){ return json({ok:false,error:errorMessage(e)},502); }
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
  return json({ok:true,count:sources.results.length,sources:sources.results});
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

 if(url.pathname==="/api/debug/refresh-state") return json({states:(await env.DB.prepare("SELECT * FROM refresh_state ORDER BY pipeline_key").all()).results});
 return json({error:"not_found",path:url.pathname},404);
}
