import type { Env } from "../env";
import { isoNow } from "../shared";

const FALLBACK = "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";

async function validProgramPage(env: Env, url: string): Promise<boolean> {
  try {
    const r = await env.BROWSER.quickAction("content", {url,gotoOptions:{waitUntil:"networkidle2",timeout:30000}});
    const body = await r.text();
    return r.ok && body.length > 10000 && /Yarış Programı|YarisProgram|Günlük Yarış/i.test(body);
  } catch { return false; }
}

export async function getTjkProgramUrl(env: Env): Promise<{url:string;discovered:boolean}> {
  const row = await env.DB.prepare("SELECT homepage_url,last_working_url FROM main_source_registry WHERE source_key='tjk_program'").first<any>();
  const current = row?.last_working_url || FALLBACK;
  // Do not browser-verify a known healthy URL on every call; extraction itself is the verification.
  if (row?.last_working_url) return {url:current,discovered:false};
  return {url:current,discovered:false};
}

export async function rediscoverTjkProgramUrl(env: Env): Promise<string> {
  const seeds=["https://www.tjk.org/TR/YarisSever","https://www.tjk.org/TR/YarisSever/Info","https://www.tjk.org"];
  const candidates=new Set<string>();
  for (const seed of seeds) {
    try {
      const r=await env.BROWSER.quickAction("links",{url:seed,excludeExternalLinks:true,gotoOptions:{waitUntil:"networkidle2",timeout:30000}});
      const raw:any=await r.json(); const links:any[]=Array.isArray(raw)?raw:(Array.isArray(raw?.result)?raw.result:[]);
      for(const item of links){ const link=typeof item==="string"?item:item?.url; if(typeof link==="string" && /GunlukYarisProgrami|YarisProgram/i.test(link)) candidates.add(new URL(link,seed).toString()); }
    } catch {}
  }
  for(const candidate of candidates) if(await validProgramPage(env,candidate)) {
    const now=isoNow();
    await env.DB.prepare(`UPDATE main_source_registry SET last_working_url=?,last_working_url_pattern=?,health_status='healthy',
      last_success_at=?,last_discovered_at=?,discovery_confidence=.95,consecutive_failures=0,updated_at=CURRENT_TIMESTAMP WHERE source_key='tjk_program'`)
      .bind(candidate,new URL(candidate).pathname,now,now).run();
    return candidate;
  }
  throw new Error("TJK program URL discovery failed");
}
