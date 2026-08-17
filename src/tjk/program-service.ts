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
    prompt:`Extract the complete official TJK daily race program from the page.

Return every domestic meeting, every race in each meeting, and every runner in each race.

CRITICAL RULES:
- raceNumber must be the actual race number.
- time must be the actual visible race start time in HH:mm format, for example 14:30. Never return null.
- runners must contain every listed runner for that race. Never return an empty array when runners are present on the page.
- For each runner extract: number, name, jockey, weight, hp and agfPercent when available.
- If jockey, weight, hp or agfPercent is unavailable, return null for that field.
- Do not invent values.
- Do not omit races.
- Do not omit runners.
- Use Turkish city names as displayed by TJK.`,
    response_format:{type:"json_schema",json_schema:tjkProgramSchema}} as any);
  if(!r.ok) throw new Error(`TJK Browser JSON HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
  const payload=unwrapQuickActionJson(await r.json());
  validateProgram(payload); validateCompleteTjkProgram(payload); return payload;
}


function validateCompleteTjkProgram(program: TjkProgramInput): void {
  if (!Array.isArray(program.meetings) || program.meetings.length === 0) {
    throw new Error("TJK extraction incomplete: no meetings");
  }

  let raceCount = 0;
  let runnerCount = 0;

  for (const meeting of program.meetings) {
    if (!meeting.city?.trim()) {
      throw new Error("TJK extraction incomplete: meeting city missing");
    }

    if (!Array.isArray(meeting.races) || meeting.races.length === 0) {
      throw new Error(
        `TJK extraction incomplete: no races for ${meeting.city}`
      );
    }

    const raceNumbers = new Set<number>();

    for (const race of meeting.races) {
      raceCount++;

      if (
        !Number.isInteger(race.raceNumber) ||
        race.raceNumber < 1
      ) {
        throw new Error(
          `TJK extraction invalid race number: ${meeting.city}`
        );
      }

      if (raceNumbers.has(race.raceNumber)) {
        throw new Error(
          `TJK extraction duplicate race: ${meeting.city} ${race.raceNumber}`
        );
      }
      raceNumbers.add(race.raceNumber);

      if (
        typeof race.time !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(race.time)
      ) {
        throw new Error(
          `TJK extraction missing/invalid start time: ${meeting.city} R${race.raceNumber}`
        );
      }

      if (!Array.isArray(race.runners) || race.runners.length === 0) {
        throw new Error(
          `TJK extraction missing runners: ${meeting.city} R${race.raceNumber}`
        );
      }

      const horseNumbers = new Set<number>();

      for (const runner of race.runners) {
        runnerCount++;

        if (
          !Number.isInteger(runner.number) ||
          runner.number < 1 ||
          !runner.name?.trim()
        ) {
          throw new Error(
            `TJK extraction invalid runner: ${meeting.city} R${race.raceNumber}`
          );
        }

        if (horseNumbers.has(runner.number)) {
          throw new Error(
            `TJK extraction duplicate horse number: ${meeting.city} R${race.raceNumber} #${runner.number}`
          );
        }

        horseNumbers.add(runner.number);
      }
    }
  }

  if (raceCount === 0 || runnerCount === 0) {
    throw new Error("TJK extraction incomplete");
  }
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
