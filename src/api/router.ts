import type { Env } from "../env";
import { json, errorMessage, turkeyDate } from "../shared";
import { getToday } from "../storage/program-repository";
import { refreshProgramIfDue } from "../tjk/program-service";
import { refreshExpertsIfDue } from "../experts/service";
import { getHistory } from "../history/service";

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
 if(url.pathname==="/api/admin/refresh" && request.method==="POST") {
  try { const program=await refreshProgramIfDue(env,true); const experts=await refreshExpertsIfDue(env,true); return json({ok:true,program,experts}); }
  catch(e){ return json({ok:false,error:errorMessage(e)},502); }
 }
 if(url.pathname==="/api/debug/sources") {
  const sources=await env.DB.prepare("SELECT source_key,source_name,domain,health_status,last_checked_at,last_success_at,last_failure_at,consecutive_failures,content_hash FROM source_registry ORDER BY source_name").all();
  return json({ok:true,count:sources.results.length,sources:sources.results});
 }
 if(url.pathname==="/api/debug/refresh-state") return json({states:(await env.DB.prepare("SELECT * FROM refresh_state ORDER BY pipeline_key").all()).results});
 return json({error:"not_found",path:url.pathname},404);
}
