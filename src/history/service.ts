import type { Env } from "../env";
import { turkeyDate } from "../shared";

export async function finalizeStartedRaces(env:Env):Promise<number>{
 const now=new Date().toISOString(); const date=turkeyDate();
 const races=(await env.DB.prepare(`SELECT city,race_number,start_time,starts_at,distance_meters,track FROM races WHERE race_date=? AND starts_at IS NOT NULL AND starts_at<=? AND finalized_at IS NULL`).bind(date,now).all<any>()).results??[];
 let count=0;
 for(const race of races){
  const runners=(await env.DB.prepare("SELECT * FROM runners WHERE race_date=? AND city=? AND race_number=? ORDER BY horse_number").bind(date,race.city,race.race_number).all<any>()).results??[];
  const experts=(await env.DB.prepare("SELECT * FROM expert_predictions WHERE race_date=? AND city=? AND race_number=? ORDER BY source_key,source_rank,horse_number").bind(date,race.city,race.race_number).all<any>()).results??[];
  const snapshot=JSON.stringify({raceDate:date,city:race.city,raceNumber:race.race_number,startTime:race.start_time,startsAt:race.starts_at,distanceMeters:race.distance_meters,track:race.track,runners,expertPredictions:experts,finalizedAt:now});
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO race_history(race_date,city,race_number,snapshot_json,finalized_at) VALUES(?,?,?,?,?) ON CONFLICT(race_date,city,race_number) DO NOTHING`).bind(date,race.city,race.race_number,snapshot,now),
   env.DB.prepare("UPDATE races SET finalized_at=? WHERE race_date=? AND city=? AND race_number=?").bind(now,date,race.city,race.race_number)
  ]); count++;
 }
 return count;
}

export async function cleanup(env:Env):Promise<void>{
 await env.DB.exec(`
 DELETE FROM expert_predictions WHERE race_date < date('now','+3 hours','-2 days') AND EXISTS(SELECT 1 FROM race_history h WHERE h.race_date=expert_predictions.race_date AND h.city=expert_predictions.city AND h.race_number=expert_predictions.race_number);
 DELETE FROM runners WHERE race_date < date('now','+3 hours','-2 days') AND EXISTS(SELECT 1 FROM race_history h WHERE h.race_date=runners.race_date AND h.city=runners.city AND h.race_number=runners.race_number);
 DELETE FROM races WHERE race_date < date('now','+3 hours','-2 days') AND EXISTS(SELECT 1 FROM race_history h WHERE h.race_date=races.race_date AND h.city=races.city AND h.race_number=races.race_number);
 DELETE FROM meetings WHERE race_date < date('now','+3 hours','-2 days');
 DELETE FROM race_history WHERE race_date < date('now','+3 hours','-2 days');
 DELETE FROM source_runs WHERE started_at < datetime('now','-7 days');
 DELETE FROM anomalies WHERE created_at < datetime('now','-7 days');
 `);
}

export async function getHistory(
 env:Env,
 pagination:{limit:number;offset:number}={limit:20,offset:0}
):Promise<{entries:any[];total:number}>{
 const total=
  Number(
   (
    await env.DB.prepare(`
     SELECT COUNT(*) total
     FROM race_history
     WHERE race_date >=
       date('now','+3 hours','-2 days')
    `).first<any>()
   )?.total ??
   0
  );

 const rows=
  (
   await env.DB.prepare(`
    SELECT snapshot_json
    FROM race_history
    WHERE race_date >=
      date('now','+3 hours','-2 days')
    ORDER BY
      race_date DESC,
      city,
      race_number
    LIMIT ? OFFSET ?
   `)
    .bind(
     pagination.limit,
     pagination.offset
    )
    .all<any>()
  ).results ?? [];

 const output:any[]=[];

 for(const row of rows){
  const snapshot=
   JSON.parse(
    String(
     row.snapshot_json
    )
   );

  const results=
   (
    await env.DB.prepare(`
     SELECT
       horse_number,
       finish_position
     FROM learning_runner_features
     WHERE
       race_date = ?
       AND city = ?
       AND race_number = ?
       AND finish_position IS NOT NULL
    `)
     .bind(
      snapshot.raceDate,
      snapshot.city,
      snapshot.raceNumber
     )
     .all<any>()
   ).results ?? [];

  const finishByHorse=
   new Map<number,number>(
    results.map(
     (item:any)=>[
      Number(
       item.horse_number
      ),
      Number(
       item.finish_position
      )
     ]
    )
   );

  snapshot.runners=
   (
    snapshot.runners ??
    []
   ).map(
    (runner:any)=>({
     ...runner,

     finishPosition:
      finishByHorse.get(
       Number(
        runner.horse_number
       )
      ) ??
      null
    })
   );

  snapshot.resultAvailable=
   finishByHorse.size>0;

  output.push(
   snapshot
  );
 }

 return {entries:output,total};
}
