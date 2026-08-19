import type { Env } from "../env";
import type { ExpertExtractionInput, ExpertPickInput } from "../types/models";
import { errorMessage, sha256, turkeyDate, unwrapQuickActionJson } from "../shared";
import { expertCheckIntervalMs } from "./policy";
import { expertSchema } from "./schema";

interface Source {
 source_key:string;
 source_name:string;
 homepage_url:string|null;
 last_working_url:string|null;
 content_hash:string|null;
 last_checked_at:string|null;
 source_type:string;
 base_weight:number;
}

async function nextRaceMinutes(env:Env):Promise<number|null>{
 const row=await env.DB.prepare("SELECT starts_at FROM races WHERE race_date=? AND starts_at>? ORDER BY starts_at LIMIT 1").bind(turkeyDate(),new Date().toISOString()).first<any>();
 return row?.starts_at ? Math.max(0,(Date.parse(row.starts_at)-Date.now())/60000) : null;
}

async function loadPage(env:Env,url:string):Promise<{text:string;method:string}>{
 const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),12000);
 try { const r=await fetch(url,{signal:ctrl.signal,headers:{"user-agent":"TwoHorse/1.0 (+race-analysis-cache)"}}); const text=await r.text(); if(r.ok && text.length>3000) return {text,method:"http"}; } catch{} finally{clearTimeout(timer);}
 const r=await env.BROWSER.quickAction("content",{url,gotoOptions:{waitUntil:"networkidle2",timeout:30000}});
 if(!r.ok) throw new Error(`browser content HTTP ${r.status}`); return {text:await r.text(),method:"browser"};
}

async function extract(env:Env,url:string,sourceName:string):Promise<ExpertExtractionInput>{
 const r=await env.BROWSER.quickAction("json",{url,gotoOptions:{waitUntil:"networkidle2",timeout:30000},
  prompt:`${sourceName} sayfasındaki BUGÜNÜN Türkiye at yarışı tahmin ve yorumlarını çıkar.

Yalnızca sayfada açıkça görülen bilgiyi kullan.

Etiket eşlemesi:
- "tek", "banko", "risk edilir" açıkça tek öneriyse -> isBanko=true
- "favori", "en şanslı", "ilk atım" -> isFavorite=true
- "güçlü", "ilk şans", "öncelikli" -> isStrong=true
- yıldız/özel işaretli ana seçim -> isStar=true
- "rakip", "ikinci şans", "daha sonra" -> isRival=true
- "sürpriz", "bomba", "tatlı kaçak" -> isSurprise=true
- açıkça olumsuz/önerilmeyen/elenen -> isAvoid=true

Aynı at birden fazla etikete sahip olabilir.

Program numarası, AGF, HP, kilo veya tarih değerlerini at numarası sanma.
Şehir, koşu numarası, at numarası ve at adı mutlaka aynı tahmine ait olmalı.
Bir etiket açıkça yoksa false kullan.
Tahmin edilmeyen bilgiyi uydurma.
Yorum varsa mümkün olduğunca kısa ama anlamlı biçimde koru.`,
  response_format:{type:"json_schema",json_schema:expertSchema}} as any);
 if(!r.ok) throw new Error(`expert json HTTP ${r.status}: ${(await r.text()).slice(0,250)}`);
 const v:any=unwrapQuickActionJson(await r.json()); if(!v || !Array.isArray(v.picks)) throw new Error("invalid expert extraction"); return v;
}

async function validatedPicks(env:Env,picks:ExpertPickInput[]):Promise<ExpertPickInput[]>{
 const out:ExpertPickInput[]=[]; const date=turkeyDate();
 for(const p of picks){
  const horse=await env.DB.prepare("SELECT horse_name FROM runners WHERE race_date=? AND city=? COLLATE NOCASE AND race_number=? AND horse_number=?")
   .bind(date,p.city,p.raceNumber,p.horseNumber).first<any>();
  if(horse && horse.horse_name){ out.push({...p,horseName:horse.horse_name}); }
  else await env.DB.prepare("INSERT INTO anomalies(race_id,source_key,anomaly_type,reason,raw_payload,created_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)")
   .bind(`${date}|${p.city}|${p.raceNumber}`,"expert","horse_mismatch","Extracted expert pick did not match canonical TJK runner",JSON.stringify(p)).run();
 }
 return out;
}

async function processSource(env:Env,source:Source):Promise<{source:string;status:string;count?:number}>{
 const url=source.last_working_url||source.homepage_url; if(!url) return {source:source.source_key,status:"no-url"};
 const page=await loadPage(env,url); const hash=await sha256(page.text);
 await env.DB.prepare("UPDATE source_registry SET last_checked_at=?,updated_at=CURRENT_TIMESTAMP WHERE source_key=?").bind(new Date().toISOString(),source.source_key).run();
 if(source.content_hash===hash) return {source:source.source_key,status:"unchanged"};
 const extracted=await extract(env,url,source.source_name); const picks=await validatedPicks(env,extracted.picks);
 const date=turkeyDate(); const statements:D1PreparedStatement[]=[];
 for(const p of picks) statements.push(env.DB.prepare(`INSERT INTO expert_predictions(
 race_date,city,race_number,horse_number,source_key,
 horse_name,comment,
 is_favorite,is_banko,is_strong,is_star,
 is_rival,is_surprise,is_avoid,
 source_rank,confidence,content_hash,updated_at
)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(race_date,city,race_number,horse_number,source_key)
 DO UPDATE SET
 horse_name=excluded.horse_name,
 comment=excluded.comment,
 is_favorite=excluded.is_favorite,
 is_banko=excluded.is_banko,
 is_strong=excluded.is_strong,
 is_star=excluded.is_star,
 is_rival=excluded.is_rival,
 is_surprise=excluded.is_surprise,
 is_avoid=excluded.is_avoid,
 source_rank=excluded.source_rank,
 confidence=excluded.confidence,
 content_hash=excluded.content_hash,
 updated_at=CURRENT_TIMESTAMP`)
 .bind(
   date,
   p.city,
   p.raceNumber,
   p.horseNumber,
   source.source_key,
   p.horseName,
   p.comment,
   p.isFavorite?1:0,
   p.isBanko?1:0,
   p.isStrong?1:0,
   p.isStar?1:0,
   p.isRival?1:0,
   p.isSurprise?1:0,
   p.isAvoid?1:0,
   p.sourceRank,
   p.confidence,
   hash
 ));
 for(let i=0;i<statements.length;i+=75) await env.DB.batch(statements.slice(i,i+75));
 await env.DB.prepare(`UPDATE source_registry SET content_hash=?,health_status='healthy',last_success_at=?,consecutive_failures=0,updated_at=CURRENT_TIMESTAMP WHERE source_key=?`)
  .bind(hash,new Date().toISOString(),source.source_key).run();
 return {source:source.source_key,status:"updated",count:picks.length};
}

async function mapLimit<T,R>(items:T[],limit:number,fn:(x:T)=>Promise<R>):Promise<R[]>{
 const results:R[]=[]; let next=0; async function worker(){while(true){const i=next++;if(i>=items.length)return;results[i]=await fn(items[i]);}} await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return results;
}

export async function refreshExpertsIfDue(env:Env,force=false):Promise<any>{
 const mins=await nextRaceMinutes(env); const interval=expertCheckIntervalMs(mins); if(interval===null) return {refreshed:false,reason:"no-upcoming-race"};
 const state=await env.DB.prepare("SELECT MAX(last_checked_at) checked FROM source_registry").first<any>();
 if(!force && state?.checked && Date.now()-Date.parse(state.checked)<interval) return {refreshed:false,reason:"fresh",nextRaceMinutes:mins};
 const sources=(await env.DB.prepare(`
 SELECT
   source_key,
   source_name,
   homepage_url,
   last_working_url,
   content_hash,
   last_checked_at,
   source_type,
   base_weight
 FROM source_registry
 WHERE enabled=1
 ORDER BY source_key
`).all<Source>()).results??[];
 const results=await mapLimit(sources,3,async s=>{try{return await processSource(env,s);}catch(e){await env.DB.prepare(`UPDATE source_registry SET health_status='degraded',last_failure_at=?,consecutive_failures=consecutive_failures+1,updated_at=CURRENT_TIMESTAMP WHERE source_key=?`).bind(new Date().toISOString(),s.source_key).run();return {source:s.source_key,status:"failed",error:errorMessage(e)};}});
 return {refreshed:true,nextRaceMinutes:mins,results};
}
