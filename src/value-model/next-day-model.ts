import type { Env } from "../env";
import { turkeyDate } from "../shared";
import { horseIdentity, jockeyIdentity } from "../learning/identity";
import type { NextDayProgram } from "../tjk/next-day-service";
import coefficients from "../scoring/data/next-day-coefficients.json";
import { addDays, domesticCity, tjkNumericId } from "./cities";
import { computeFeatures, type FeatureRunner, type FeatureVector, type PastRun } from "./features";
import { loadGallops } from "./gallops";
import { loadDrawStats, loadHistory, loadJockeys } from "./predictions";

/*
 * Tomorrow's model: a no-AGF win model for the D+1 card, built from what
 * is known the evening before (speed figures, same-trip figure, gallops,
 * draw, jockey and horse strike rates, HP, weight, last finish, runs and
 * layoff). Fitted on 12,646 archive races (Sep 2024 - 18 Aug 2026);
 * on 829 later live races its top pick won 26.8% and the winner was in
 * its top 3 60.3% of the time, against 24.2% / 53.6% for the weighted
 * fallback it replaces there (AGF's favourite, not available the evening
 * before: 33.7% / 66.5%). Analysis: analysis/yedek-puan-yeni-model-2026-10-11.
 *
 * Inputs need database reads per race, so a cron step computes each
 * runner's utility into value_model_cache and the API only adds the
 * expert nudge and turns utilities into probabilities.
 */

export const NEXT_DAY_MODEL_CONFIG = {
  /* Gallops for tomorrow's horses arrive through the evening. */
  refreshMinutes: 30
} as const;

type CoefficientFeature = { name: string; mean: number; sd: number; coef: number; naCoef: number };
const FEATURES = coefficients.features as CoefficientFeature[];

export interface NextDayExtras {
  hp: number | null;
  weight: number | null;
  lastFinish: number | null;
}

function relativeToField(values: Array<number | null>): Array<number | null> {
  const present = values.filter((x): x is number => x != null);
  if (!present.length) return values.map(() => null);
  const mean = present.reduce((s, x) => s + x, 0) / present.length;
  return values.map(x => (x == null ? null : x - mean));
}

/* Each runner's utility before experts, in the order given. */
export function nextDayUtilities(features: FeatureVector[], extras: NextDayExtras[]): number[] {
  const hpRel = relativeToField(extras.map(x => x.hp));
  const wtRel = relativeToField(extras.map(x => x.weight));
  return features.map((f, i) => {
    const values: Record<string, number | null> = {
      ...f,
      hp_rel: hpRel[i],
      wt_rel: wtRel[i],
      lastfin: extras[i].lastFinish == null ? null : Math.min(extras[i].lastFinish as number, 12),
      ln_prev: Math.log1p(f.n_prev ?? 0),
      ldays: f.days_off == null ? null : Math.log1p(Math.min(f.days_off, 365))
    };
    let u = 0;
    for (const c of FEATURES) {
      const x = values[c.name];
      if (x == null || !Number.isFinite(x)) {
        u += c.naCoef;
      } else {
        u += c.coef * Math.max(-4, Math.min(4, (x - c.mean) / c.sd));
      }
    }
    return u;
  });
}

/* Utility plus the expert nudge, as win probabilities summing to 1. */
export function nextDayProbabilities(
  utilities: number[],
  expertScores: Array<number | null>
): number[] {
  const { mean, sd, coef } = coefficients.expert;
  const u = utilities.map((value, i) => {
    const e = expertScores[i];
    return value + (e == null || !Number.isFinite(e) ? 0 : coef * (e - mean) / sd);
  });
  const max = Math.max(...u);
  const exp = u.map(v => Math.exp(v - max));
  const total = exp.reduce((s, v) => s + v, 0);
  return exp.map(v => v / total);
}

export function nextDayCacheKey(date: string): string {
  return `nextday-model:${date}`;
}

export function nextDayRaceKey(city: string, raceNumber: number): string {
  return `${city.trim()}|${raceNumber}`;
}

export type NextDayUtilityMap = Map<string, Map<number, number>>;

export async function loadNextDayUtilities(env: Env, date: string): Promise<NextDayUtilityMap> {
  const out: NextDayUtilityMap = new Map();
  const row = await env.DB.prepare(`SELECT value_json FROM value_model_cache WHERE cache_key = ?`)
    .bind(nextDayCacheKey(date)).first<any>();
  if (!row) return out;
  const value = JSON.parse(row.value_json);
  for (const [race, runners] of Object.entries(value.races ?? {})) {
    out.set(race, new Map(Object.entries(runners as Record<string, number>).map(([k, v]) => [Number(k), Number(v)])));
  }
  return out;
}

/* Cron: compute tomorrow's utilities when the card exists and the last run is stale. */
export async function refreshNextDayModel(env: Env, now = new Date()): Promise<number> {
  const target = addDays(turkeyDate(now), 1);
  const stored = await env.DB.prepare(`SELECT program_json, fetched_at FROM next_day_programs WHERE race_date = ?`)
    .bind(target).first<any>();
  if (!stored) return 0;

  const key = nextDayCacheKey(target);
  const cached = await env.DB.prepare(`SELECT updated_at FROM value_model_cache WHERE cache_key = ?`)
    .bind(key).first<any>();
  if (cached) {
    const age = now.getTime() - Date.parse(cached.updated_at);
    const cardIsNewer = Date.parse(stored.fetched_at) > Date.parse(cached.updated_at);
    if (age < NEXT_DAY_MODEL_CONFIG.refreshMinutes * 60_000 && !cardIsNewer) return 0;
  }

  const program = JSON.parse(stored.program_json) as NextDayProgram;
  const drawStats = await loadDrawStats(env, target);
  const races: Record<string, Record<string, number>> = {};
  let count = 0;

  for (const meeting of program.meetings) {
    const cityId = domesticCity(meeting.city)?.id ?? null;
    for (const race of meeting.races) {
      if (race.runners.length < 2) continue;
      const runners: FeatureRunner[] = race.runners.map(r => ({
        horseNumber: r.horse_number,
        horseId: tjkNumericId(horseIdentity(r.horse_name, r.horse_profile_url)),
        jockeyId: tjkNumericId(jockeyIdentity(r.jockey, r.jockey_profile_url)),
        weight: r.weight,
        agfPercent: null,
        odds: null,
        startPosition: r.start_position
      }));
      const horseIds = runners.map(r => r.horseId).filter((x): x is number => x != null);
      const history = await loadHistory(env, horseIds, target);
      const lastJockeys = [...history.values()].map(h => h[h.length - 1]?.jockeyId ?? null);
      const jockeyIds = [...new Set([...runners.map(r => r.jockeyId), ...lastJockeys].filter((x): x is number => x != null))];
      const jockeys = await loadJockeys(env, jockeyIds, target);
      const gallops = await loadGallops(env, horseIds);

      const features = computeFeatures(
        { raceDate: target, distanceMeters: race.distance_meters, surface: race.track, history, jockeys, gallops, cityId, drawStats },
        runners
      );
      const extras = runners.map((r, i) => {
        const runs: PastRun[] = (r.horseId != null ? history.get(r.horseId) : undefined) ?? [];
        return {
          hp: race.runners[i].hp,
          weight: race.runners[i].weight,
          lastFinish: runs.length ? runs[runs.length - 1].finish ?? null : null
        };
      });
      const utilities = nextDayUtilities(features, extras);
      races[nextDayRaceKey(meeting.city, race.race_number)] = Object.fromEntries(
        runners.map((r, i) => [String(r.horseNumber), Math.round(utilities[i] * 1e6) / 1e6])
      );
      count += runners.length;
    }
  }

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO value_model_cache(cache_key, value_json, updated_at) VALUES(?,?,?)
      ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
    `).bind(key, JSON.stringify({ version: coefficients._meta.version, races }), now.toISOString()),
    env.DB.prepare(`DELETE FROM value_model_cache WHERE cache_key LIKE 'nextday-model:%' AND cache_key < ?`)
      .bind(nextDayCacheKey(turkeyDate(now)))
  ]);
  return count;
}

/* Tomorrow's horses, so their gallops are fetched before the model runs. */
export async function nextDayHorseIds(env: Env, now = new Date()): Promise<number[]> {
  const target = addDays(turkeyDate(now), 1);
  const stored = await env.DB.prepare(`SELECT program_json FROM next_day_programs WHERE race_date = ?`)
    .bind(target).first<any>();
  if (!stored) return [];
  const program = JSON.parse(stored.program_json) as NextDayProgram;
  const ids = program.meetings.flatMap(m => m.races.flatMap(r => r.runners.map(u =>
    tjkNumericId(horseIdentity(u.horse_name, u.horse_profile_url)))));
  return [...new Set(ids.filter((x): x is number => x != null))];
}
