import type { Env } from "../env";
import { turkeyDate } from "../shared";
import { addDays, domesticCity, tjkNumericId } from "./cities";
import {
  VALUE_MODEL_FEATURES,
  computeFeatures,
  marketProbabilities,
  drawKey,
  type DrawCell,
  type FeatureRunner,
  type JockeyWindow,
  type PastRun
} from "./features";
import { loadGallops } from "./gallops";
import { chooseVariant, scoreRace, type Coefficients } from "./model";
import { latestOdds } from "./odds";

export const PREDICTION_CONFIG = {
  racesPerTick: 12,
  /* races this close to the off are recomputed every tick (odds move) */
  hotMinutes: 90,
  /* other races of the day are refreshed this often (AGF moves) */
  refreshMinutes: 30,
  /* label thresholds: model vs AGF (or ganyan when there is no AGF) */
  underratedRatio: 1.2,
  underratedMinProbability: 0.04,
  overratedRatio: 1 / 1.2,
  overratedMinProbability: 0.10,
  /* draw-bias cells change only as the archive grows */
  drawCacheHours: 6
} as const;

const DAY_MS = 86_400_000;

function raceCodeFromPerformanceUrl(url: string | null | undefined): number | null {
  const m = /[?&]QueryParameter_KKODU=(\d+)/i.exec(url ?? "");
  return m ? Number(m[1]) : null;
}

function marks(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

export async function loadHistory(env: Env, horseIds: number[], raceDate: string): Promise<Map<number, PastRun[]>> {
  const out = new Map<number, PastRun[]>();
  if (!horseIds.length) return out;
  const rows = await env.DB.prepare(`
    SELECT u.horse_id, u.race_date, u.fig, u.finish_position, u.p_win, u.jockey_id, u.weight,
           r.distance_meters, r.surface
    FROM result_archive_runners u
    JOIN result_archive_races r USING (race_code)
    WHERE u.horse_id IN (${marks(horseIds.length)}) AND u.race_date < ?
    ORDER BY u.race_date, r.city_id, r.race_number
  `).bind(...horseIds, raceDate).all<any>();
  for (const r of rows.results ?? []) {
    const list = out.get(Number(r.horse_id)) ?? [];
    list.push({
      raceDate: r.race_date,
      fig: r.fig == null ? null : Number(r.fig),
      won: Number(r.finish_position) === 1,
      pWin: r.p_win == null ? null : Number(r.p_win),
      distanceMeters: r.distance_meters == null ? null : Number(r.distance_meters),
      surface: r.surface,
      jockeyId: r.jockey_id == null ? null : Number(r.jockey_id),
      weight: r.weight == null ? null : Number(r.weight)
    });
    out.set(Number(r.horse_id), list);
  }
  return out;
}

export async function loadJockeys(env: Env, jockeyIds: number[], raceDate: string): Promise<Map<number, JockeyWindow>> {
  const out = new Map<number, JockeyWindow>();
  if (!jockeyIds.length) return out;
  const rows = await env.DB.prepare(`
    SELECT jockey_id, COUNT(*) AS rides,
           SUM(CASE WHEN finish_position = 1 THEN 1 ELSE 0 END) AS wins,
           SUM(COALESCE(p_win, 0)) AS expected
    FROM result_archive_runners
    WHERE jockey_id IN (${marks(jockeyIds.length)}) AND race_date >= ? AND race_date < ?
    GROUP BY jockey_id
  `).bind(...jockeyIds, addDays(raceDate, -365), raceDate).all<any>();
  for (const r of rows.results ?? []) {
    out.set(Number(r.jockey_id), { rides: Number(r.rides), wins: Number(r.wins), expectedWins: Number(r.expected) });
  }
  return out;
}

/* Draw-bias cells from every archived market race before raceDate (see drawKey). */
export async function computeDrawStats(env: Env, raceDate: string): Promise<Map<string, DrawCell>> {
  const rows = await env.DB.prepare(`
    SELECT r.city_id, r.surface, r.distance_meters, u.start_position,
           COUNT(*) AS n, SUM(CASE WHEN u.finish_position = 1 THEN 1 ELSE 0 END) AS wins, SUM(u.p_win) AS expected
    FROM result_archive_runners u
    JOIN result_archive_races r USING (race_code)
    WHERE r.market_ok = 1 AND u.race_date < ? AND u.start_position IS NOT NULL
      AND r.surface IS NOT NULL AND r.distance_meters IS NOT NULL
    GROUP BY r.city_id, r.surface, r.distance_meters, u.start_position
  `).bind(raceDate).all<any>();
  const out = new Map<string, DrawCell>();
  for (const r of rows.results ?? []) {
    const key = drawKey(Number(r.city_id), r.surface, Number(r.distance_meters), Number(r.start_position));
    const cell = out.get(key) ?? { wins: 0, expected: 0 };
    cell.wins += Number(r.wins);
    cell.expected += Number(r.expected ?? 0);
    out.set(key, cell);
  }
  return out;
}

/* The aggregate scans the whole archive; it is cached per race date and refreshed a few times a day. */
export async function loadDrawStats(env: Env, raceDate: string): Promise<Map<string, DrawCell>> {
  const key = `draw:${raceDate}`;
  const cached = await env.DB.prepare(`SELECT value_json, updated_at FROM value_model_cache WHERE cache_key = ?`)
    .bind(key).first<any>();
  if (cached && Date.now() - Date.parse(cached.updated_at) < PREDICTION_CONFIG.drawCacheHours * 3_600_000) {
    return new Map(Object.entries(JSON.parse(cached.value_json)) as Array<[string, DrawCell]>);
  }
  const stats = await computeDrawStats(env, raceDate);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO value_model_cache(cache_key, value_json, updated_at) VALUES(?,?,?)
      ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
    `).bind(key, JSON.stringify(Object.fromEntries(stats)), new Date().toISOString()),
    env.DB.prepare(`DELETE FROM value_model_cache WHERE cache_key LIKE 'draw:%' AND cache_key < ?`)
      .bind(`draw:${addDays(raceDate, -7)}`)
  ]);
  return stats;
}

export function valueLabel(pModel: number, pReference: number | null): "underrated" | "overrated" | null {
  if (pReference == null || pReference <= 0) return null;
  const ratio = pModel / pReference;
  if (ratio >= PREDICTION_CONFIG.underratedRatio && pModel >= PREDICTION_CONFIG.underratedMinProbability) return "underrated";
  if (ratio <= PREDICTION_CONFIG.overratedRatio && pReference >= PREDICTION_CONFIG.overratedMinProbability) return "overrated";
  return null;
}

interface RaceRow {
  race_date: string;
  city: string;
  race_number: number;
  starts_at: string | null;
  distance_meters: number | null;
  track: string | null;
  performance_url: string | null;
}

export async function predictRace(
  env: Env, race: RaceRow, coefficients: Coefficients, drawStats: Map<string, DrawCell> | null = null
): Promise<number> {
  const runnerRows = await env.DB.prepare(`
    SELECT horse_number, horse_id, jockey_id, weight, agf_percent, start_position FROM runners
    WHERE race_date = ? AND city = ? AND race_number = ? ORDER BY horse_number
  `).bind(race.race_date, race.city, race.race_number).all<any>();
  const odds = await latestOdds(env, race.race_date, race.city, race.race_number);

  /* TJK marks scratched horses in the odds feed; they are not in the field. */
  let field = (runnerRows.results ?? []).filter((r: any) => !odds.get(Number(r.horse_number))?.scratched);
  /* Before the win pool opens, a horse with no AGF in an AGF race is a
   * withdrawal (TJK drops it from the AGF table). */
  const withAgf = field.filter((r: any) => Number(r.agf_percent) > 0);
  if (!odds.size && withAgf.length >= 2 && withAgf.length < field.length && field.length - withAgf.length <= 2) {
    field = withAgf;
  }
  if (field.length < 2) return 0;

  const runners: FeatureRunner[] = field.map((r: any) => ({
    horseNumber: Number(r.horse_number),
    horseId: tjkNumericId(r.horse_id),
    jockeyId: tjkNumericId(r.jockey_id),
    weight: r.weight == null ? null : Number(r.weight),
    agfPercent: r.agf_percent == null ? null : Number(r.agf_percent),
    odds: odds.get(Number(r.horse_number))?.odds ?? null,
    startPosition: r.start_position == null ? null : Number(r.start_position)
  }));

  const horseIds = runners.map(r => r.horseId).filter((x): x is number => x != null);
  const history = await loadHistory(env, horseIds, race.race_date);
  const lastJockeys = [...history.values()].map(h => h[h.length - 1]?.jockeyId ?? null);
  const jockeyIds = [...new Set([...runners.map(r => r.jockeyId), ...lastJockeys].filter((x): x is number => x != null))];
  const jockeys = await loadJockeys(env, jockeyIds, race.race_date);
  const gallops = await loadGallops(env, horseIds);

  const features = computeFeatures(
    {
      raceDate: race.race_date, distanceMeters: race.distance_meters, surface: race.track, history, jockeys, gallops,
      cityId: domesticCity(race.city)?.id ?? null, drawStats
    },
    runners
  );
  const { pAgf, pGanyan } = marketProbabilities(runners);
  const variant = chooseVariant(pAgf, pGanyan);
  if (!variant) return 0;
  const p = scoreRace(coefficients, variant, features, pAgf, pGanyan);

  const now = new Date().toISOString();
  const raceCode = raceCodeFromPerformanceUrl(race.performance_url);
  const statements = runners.map((r, i) => {
    const reference = pAgf[i] ?? pGanyan[i];
    return env.DB.prepare(`
      INSERT INTO value_model_predictions(
        race_date, city, race_number, horse_number, horse_id, race_code, variant, model_version,
        p_model, p_agf, p_ganyan, odds, value_ratio, features_json, computed_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(race_date, city, race_number, horse_number) DO UPDATE SET
        horse_id=excluded.horse_id, race_code=excluded.race_code, variant=excluded.variant,
        model_version=excluded.model_version, p_model=excluded.p_model, p_agf=excluded.p_agf,
        p_ganyan=excluded.p_ganyan, odds=excluded.odds, value_ratio=excluded.value_ratio,
        features_json=excluded.features_json, computed_at=excluded.computed_at
      WHERE value_model_predictions.frozen_at IS NULL
    `).bind(
      race.race_date, race.city, race.race_number, r.horseNumber, r.horseId, raceCode, variant,
      coefficients._meta.version, p[i], pAgf[i], pGanyan[i], r.odds,
      reference ? p[i] / reference : null,
      JSON.stringify(VALUE_MODEL_FEATURES.map(k => {
        const v = features[i][k];
        return v == null ? null : Math.round(v * 1e6) / 1e6;
      })),
      now
    );
  });
  /* Horses scratched after an earlier computation leave the field. */
  statements.push(env.DB.prepare(`
    DELETE FROM value_model_predictions
    WHERE race_date = ? AND city = ? AND race_number = ? AND frozen_at IS NULL
      AND horse_number NOT IN (${marks(runners.length)})
  `).bind(race.race_date, race.city, race.race_number, ...runners.map(r => r.horseNumber)));
  await env.DB.batch(statements);
  return runners.length;
}

/* Today's races not yet off: near ones every tick, the rest every refreshMinutes. */
export async function refreshPredictions(env: Env, coefficients: Coefficients, today = turkeyDate()): Promise<number> {
  const now = new Date();
  const hot = new Date(now.getTime() + PREDICTION_CONFIG.hotMinutes * 60_000).toISOString();
  const stale = new Date(now.getTime() - PREDICTION_CONFIG.refreshMinutes * 60_000).toISOString();
  const races = await env.DB.prepare(`
    SELECT r.race_date, r.city, r.race_number, r.starts_at, r.distance_meters, r.track, r.performance_url
    FROM races r
    LEFT JOIN (
      SELECT race_date, city, race_number, MIN(computed_at) AS computed_at
      FROM value_model_predictions WHERE race_date = ? GROUP BY race_date, city, race_number
    ) p USING (race_date, city, race_number)
    WHERE r.race_date = ? AND r.starts_at > ?
      AND (p.computed_at IS NULL OR r.starts_at <= ? OR p.computed_at < ?)
    ORDER BY r.starts_at
    LIMIT ?
  `).bind(today, today, now.toISOString(), hot, stale, PREDICTION_CONFIG.racesPerTick).all<RaceRow>();

  let count = 0;
  const drawStats = races.results?.length ? await loadDrawStats(env, today) : null;
  for (const race of races.results ?? []) {
    count += await predictRace(env, race, coefficients, drawStats);
  }
  return count;
}

/* The last pre-off prediction is the one that counts: stop updating at the off. */
export async function freezeStartedRaces(env: Env): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE value_model_predictions SET frozen_at = ?
    WHERE frozen_at IS NULL AND EXISTS (
      SELECT 1 FROM races r
      WHERE r.race_date = value_model_predictions.race_date AND r.city = value_model_predictions.city
        AND r.race_number = value_model_predictions.race_number
        AND r.starts_at IS NOT NULL AND r.starts_at <= ?
    )
  `).bind(now, now).run();
  /* Races no longer in the program (retention) are frozen too. */
  await env.DB.prepare(`
    UPDATE value_model_predictions SET frozen_at = ? WHERE frozen_at IS NULL AND race_date < ?
  `).bind(now, turkeyDate()).run();
}

/* Finish positions and final ganyan come from the result archive. */
export async function labelPredictions(env: Env): Promise<number> {
  const res = await env.DB.prepare(`
    UPDATE value_model_predictions SET
      finish_position = (
        SELECT a.finish_position FROM result_archive_runners a
        WHERE a.race_code = value_model_predictions.race_code AND a.horse_id = value_model_predictions.horse_id
      ),
      final_ganyan = (
        SELECT a.ganyan FROM result_archive_runners a
        WHERE a.race_code = value_model_predictions.race_code AND a.horse_id = value_model_predictions.horse_id
      )
    WHERE frozen_at IS NOT NULL AND finish_position IS NULL AND race_code IS NOT NULL
      AND race_date >= ? AND EXISTS (
        SELECT 1 FROM result_archive_runners a
        WHERE a.race_code = value_model_predictions.race_code AND a.horse_id = value_model_predictions.horse_id
      )
  `).bind(new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10)).run();
  return Number(res.meta?.changes ?? 0);
}
