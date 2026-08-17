import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";
import { errorMessage, sha256, unwrapQuickActionJson } from "../shared";
import { getState, isDue, acquireLease, markFailure, markSuccess } from "../storage/state";
import { upsertProgram } from "../storage/program-repository";
import { getTjkProgramUrl, rediscoverTjkProgramUrl } from "./registry";
import { tjkProgramSchema } from "./schema";

const KEY="tjk:program";
const TTL_MS=60*60*1000;

function validateProgram(value:any): asserts value is TjkProgramInput {
  if(!value || !Array.isArray(value.meetings) || value.meetings.length===0) throw new Error("TJK extraction returned no meetings");
  for(const m of value.meetings) {
    if(typeof m.city!=="string" || !Array.isArray(m.races)) throw new Error("Invalid meeting");
    for(const r of m.races) if(!Number.isInteger(r.raceNumber) || !Array.isArray(r.runners)) throw new Error("Invalid race");
  }
}

async function extract(env:Env,url:string):Promise<TjkProgramInput>{
  const r=await env.BROWSER.quickAction("json",{url,gotoOptions:{waitUntil:"networkidle2",timeout:30000},
    prompt:`TJK günlük yarış programını çıkar. Yalnız sayfada görünen gerçek veriyi kullan. Hipodromları meetings, koşuları races, atları runners altında grupla. At ve koşu numaralarını karıştırma. AGF/HP/jokey/kilo yoksa null döndür.`,
    response_format:{type:"json_schema",json_schema:tjkProgramSchema}} as any);
  if(!r.ok) throw new Error(`TJK Browser JSON HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
  const payload=unwrapQuickActionJson(await r.json());
  validateProgram(payload); return payload;
}

export async function refreshProgramIfDue(env:Env,force=false):Promise<{refreshed:boolean;reason:string}>{
  const state=await getState(env,KEY);
  if(!force && !isDue(state,TTL_MS)) return {refreshed:false,reason:"fresh"};
  if(!await acquireLease(env,KEY,120)) return {refreshed:false,reason:"already-refreshing"};
  try {
    let {url}=await getTjkProgramUrl(env); let program:TjkProgramInput;
    try { program=await extract(env,url); }
    catch(first){ url=await rediscoverTjkProgramUrl(env); program=await extract(env,url); }
    const hash=await sha256(JSON.stringify(program));
    const old=await env.DB.prepare("SELECT source_hash FROM meetings WHERE race_date=date('now','+3 hours') LIMIT 1").first<any>();
    if(old?.source_hash!==hash) await upsertProgram(env,program,hash);
    await markSuccess(env,KEY);
    return {refreshed:true,reason:old?.source_hash===hash?"unchanged":"updated"};
  } catch(e){ await markFailure(env,KEY,errorMessage(e)); throw e; }
}
