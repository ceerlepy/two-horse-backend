import type { Env } from "../env";
import { turkeyDate } from "../shared";
import { addDays } from "./cities";
import { VALUE_MODEL_FEATURES, computeFeatures, marketProbabilities, type FeatureRunner } from "./features";
import { gallopBackfillState, loadGallops } from "./gallops";
import { chooseVariant } from "./model";
import { computeDrawStats, loadHistory, loadJockeys } from "./predictions";

/*
 * Training rows for the monthly refit, built from the result archive so
 * the refit does not have to wait for ~1,500 live races. Each archived
 * market race gets the features the live model would have computed that
 * morning (history, jockey window, draw cells and gallops all strictly
 * before the race date), anchored on the final market (AGF and final
 * ganyan), which is what the shipped coefficients were fitted on.
 *
 * Built newest date first, a few dates per tick, once the gallop backfill
 * has finished (otherwise the gallop features would be missing in training
 * but present live). featureVersion bumps when features.ts changes, and
 * dates built by an older version are rebuilt.
 */
export const TRAINING_CONFIG = {
  lookbackDays: 365,
  datesPerTick: 3,
  featureVersion: 1,
  retentionDays: 400
} as const;

export async function pendingTrainingDates(env: Env, limit: number, today = turkeyDate()): Promise<string[]> {
  const rows = await env.DB.prepare(`
    SELECT a.race_date FROM result_archive_dates a
    LEFT JOIN value_model_training_dates t ON t.race_date = a.race_date
    WHERE a.status = 'done' AND a.race_date >= ? AND a.race_date < ?
      AND (t.race_date IS NULL OR t.feature_version < ?)
    ORDER BY a.race_date DESC
    LIMIT ?
  `).bind(addDays(today, -TRAINING_CONFIG.lookbackDays), today, TRAINING_CONFIG.featureVersion, limit).all<any>();
  return (rows.results ?? []).map((r: any) => String(r.race_date));
}

export async function buildTrainingDate(env: Env, raceDate: string): Promise<number> {
  const races = await env.DB.prepare(`
    SELECT race_code, city_id, distance_meters, surface FROM result_archive_races
    WHERE race_date = ? AND market_ok = 1 ORDER BY city_id, race_number
  `).bind(raceDate).all<any>();
  const runnerRows = await env.DB.prepare(`
    SELECT race_code, horse_id, horse_number, finish_position, ganyan, agf_percent, jockey_id, weight, start_position
    FROM result_archive_runners WHERE race_date = ? ORDER BY race_code, horse_number
  `).bind(raceDate).all<any>();
  const byRace = new Map<number, any[]>();
  for (const r of runnerRows.results ?? []) {
    const list = byRace.get(Number(r.race_code)) ?? [];
    list.push(r);
    byRace.set(Number(r.race_code), list);
  }
  const drawStats = (races.results ?? []).length ? await computeDrawStats(env, raceDate) : null;

  /* Bound parameters are capped at 100 per statement: 12 rows per INSERT. */
  const rows: unknown[][] = [];
  let built = 0;
  for (const race of races.results ?? []) {
    const field = byRace.get(Number(race.race_code)) ?? [];
    if (field.length < 2 || field.filter(r => Number(r.finish_position) === 1).length !== 1) continue;
    const runners: FeatureRunner[] = field.map(r => ({
      horseNumber: Number(r.horse_number),
      horseId: Number(r.horse_id),
      jockeyId: r.jockey_id == null ? null : Number(r.jockey_id),
      weight: r.weight == null ? null : Number(r.weight),
      agfPercent: r.agf_percent == null ? null : Number(r.agf_percent),
      odds: r.ganyan == null ? null : Number(r.ganyan),
      startPosition: r.start_position == null ? null : Number(r.start_position)
    }));
    const { pAgf, pGanyan } = marketProbabilities(runners);
    const variant = chooseVariant(pAgf, pGanyan);
    if (!variant) continue;

    const horseIds = runners.map(r => r.horseId as number);
    const history = await loadHistory(env, horseIds, raceDate);
    const lastJockeys = [...history.values()].map(h => h[h.length - 1]?.jockeyId ?? null);
    const jockeyIds = [...new Set([...runners.map(r => r.jockeyId), ...lastJockeys].filter((x): x is number => x != null))];
    const jockeys = await loadJockeys(env, jockeyIds, raceDate);
    const gallops = await loadGallops(env, horseIds);
    const features = computeFeatures(
      {
        raceDate, distanceMeters: race.distance_meters == null ? null : Number(race.distance_meters),
        surface: race.surface, history, jockeys, gallops, cityId: Number(race.city_id), drawStats
      },
      runners
    );
    runners.forEach((r, i) => rows.push([
      Number(race.race_code), r.horseId, raceDate, variant, pAgf[i], pGanyan[i],
      Number(field[i].finish_position) === 1 ? 1 : 0,
      JSON.stringify(VALUE_MODEL_FEATURES.map(k => {
        const v = features[i][k];
        return v == null ? null : Math.round(v * 1e6) / 1e6;
      }))
    ]));
    built++;
  }

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`DELETE FROM value_model_training_rows WHERE race_date = ?`).bind(raceDate)
  ];
  for (let i = 0; i < rows.length; i += 12) {
    const chunk = rows.slice(i, i + 12);
    statements.push(env.DB.prepare(`
      INSERT OR REPLACE INTO value_model_training_rows(
        race_code, horse_id, race_date, variant, p_agf, p_ganyan, won, features_json
      ) VALUES ${chunk.map(() => "(?,?,?,?,?,?,?,?)").join(",")}
    `).bind(...chunk.flat()));
  }
  statements.push(env.DB.prepare(`
    INSERT INTO value_model_training_dates(race_date, races, feature_version, built_at) VALUES(?,?,?,?)
    ON CONFLICT(race_date) DO UPDATE SET races=excluded.races, feature_version=excluded.feature_version,
      built_at=excluded.built_at
  `).bind(raceDate, built, TRAINING_CONFIG.featureVersion, new Date().toISOString()));
  /* One transaction: a date is either fully rebuilt and marked, or left pending. */
  await env.DB.batch(statements);
  return built;
}

export async function refreshTrainingRows(env: Env, today = turkeyDate()): Promise<{ dates: string[]; races: number }> {
  if (!(await gallopBackfillState(env)).done) return { dates: [], races: 0 };
  const dates = await pendingTrainingDates(env, TRAINING_CONFIG.datesPerTick, today);
  let races = 0;
  for (const d of dates) races += await buildTrainingDate(env, d);
  return { dates, races };
}

export async function trainingCoverage(env: Env, today = turkeyDate()): Promise<{ dates: number; races: number; pending: number }> {
  const [built, pending] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS dates, COALESCE(SUM(races), 0) AS races FROM value_model_training_dates
      WHERE race_date >= ? AND feature_version >= ?
    `).bind(addDays(today, -TRAINING_CONFIG.lookbackDays), TRAINING_CONFIG.featureVersion).first<any>(),
    pendingTrainingDates(env, 1000, today)
  ]);
  return { dates: Number(built?.dates ?? 0), races: Number(built?.races ?? 0), pending: pending.length };
}
