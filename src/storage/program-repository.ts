import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";
import { turkeyDate, turkeyDateTime } from "../shared";

export async function upsertProgram(env: Env, program: TjkProgramInput, sourceHash: string): Promise<void> {
  const date = turkeyDate();
  const statements: D1PreparedStatement[] = [];
  for (const meeting of program.meetings) {
    statements.push(env.DB.prepare(`INSERT INTO meetings(race_date,city,source_hash,updated_at)
      VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(race_date,city) DO UPDATE SET source_hash=excluded.source_hash,updated_at=CURRENT_TIMESTAMP`)
      .bind(date, meeting.city, sourceHash));
    for (const race of meeting.races) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(race.time ?? "")) {
          throw new Error(`Refusing incomplete race: ${meeting.city} R${race.raceNumber} invalid time`);
        }
        if (!race.runners?.length) {
          throw new Error(`Refusing incomplete race: ${meeting.city} R${race.raceNumber} no runners`);
        }
        const startsAtDate = turkeyDateTime(date, race.time);
        if (!startsAtDate) {
          throw new Error(`Unable to build starts_at: ${meeting.city} R${race.raceNumber}`);
        }
        const startsAt = startsAtDate.toISOString();
      statements.push(env.DB.prepare(`INSERT INTO races(race_date,city,race_number,start_time,starts_at,distance_meters,track,updated_at)
        VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(race_date,city,race_number) DO UPDATE SET
        start_time=excluded.start_time,starts_at=excluded.starts_at,distance_meters=excluded.distance_meters,track=excluded.track,updated_at=CURRENT_TIMESTAMP`)
        .bind(date, meeting.city, race.raceNumber, race.time, startsAt, race.distanceMeters, race.track));
      for (const r of race.runners) {
        statements.push(env.DB.prepare(`INSERT INTO runners(race_date,city,race_number,horse_number,horse_name,jockey,weight,hp,agf_percent,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(race_date,city,race_number,horse_number) DO UPDATE SET
          horse_name=excluded.horse_name,jockey=excluded.jockey,weight=excluded.weight,hp=excluded.hp,agf_percent=excluded.agf_percent,updated_at=CURRENT_TIMESTAMP`)
          .bind(date, meeting.city, race.raceNumber, r.number, r.name, r.jockey, r.weight, r.hp, r.agfPercent));
      }
    }
  }
  // D1 batch has practical statement limits; chunk to keep requests predictable.
  for (let i=0; i<statements.length; i+=75) await env.DB.batch(statements.slice(i, i+75));
}

export async function getToday(env: Env): Promise<any> {
  const date = turkeyDate();
  const meetings = await env.DB.prepare("SELECT city,updated_at FROM meetings WHERE race_date=? ORDER BY city").bind(date).all<any>();
  const races = await env.DB.prepare("SELECT * FROM races WHERE race_date=? ORDER BY city,race_number").bind(date).all<any>();
  const runners = await env.DB.prepare("SELECT * FROM runners WHERE race_date=? ORDER BY city,race_number,horse_number").bind(date).all<any>();
  const experts = await env.DB.prepare("SELECT * FROM expert_predictions WHERE race_date=? ORDER BY city,race_number,source_key,source_rank,horse_number").bind(date).all<any>();
  return (meetings.results ?? []).map((m:any) => ({
    city:m.city,
    races:(races.results ?? []).filter((r:any)=>r.city===m.city).map((r:any)=>({
      ...r,
      runners:(runners.results ?? []).filter((x:any)=>x.city===m.city && x.race_number===r.race_number).map((x:any)=>({
        ...x,
        expertPredictions:(experts.results ?? []).filter((e:any)=>e.city===m.city && e.race_number===r.race_number && e.horse_number===x.horse_number)
      }))
    }))
  }));
}
