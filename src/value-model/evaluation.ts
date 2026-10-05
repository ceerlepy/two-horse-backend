import type { Env } from "../env";
import { turkeyDate } from "../shared";
import { addDays } from "./cities";
import type { FeatureName } from "./features";
import { VALUE_MODEL_FEATURES } from "./features";
import { SHIPPED_COEFFICIENTS, type Coefficients, type Variant, type VariantCoefficients } from "./model";
import { valueLabel } from "./predictions";

/*
 * Safety net. Weekly: compare the frozen pre-off predictions of the last
 * evaluationRaces races with the market they were anchored on (AGF, or
 * ganyan where there is no AGF). If the model is worse, labels are hidden
 * (status "paused") until a later evaluation recovers. Monthly: refit the
 * coefficients on the stored features and adopt them only if they beat the
 * coefficients in use on the newest 20% of races.
 */
export const EVALUATION_CONFIG = {
  evaluateEveryDays: 7,
  evaluationRaces: 500,
  minRacesToJudge: 150,
  retrainEveryDays: 30,
  minRacesToRetrain: 1500,
  retrainLookbackDays: 365,
  minHoldoutGain: 0.002,
  minHistoryDays: 200
} as const;

export type ValueModelStatus = "active" | "paused" | "warming";

export interface StoredState {
  status: ValueModelStatus;
  status_reason: string | null;
  evaluated_at: string | null;
  evaluation_json: string | null;
  coefficients_json: string | null;
  coefficients_version: string | null;
  retrained_at: string | null;
}

export async function loadState(env: Env): Promise<StoredState> {
  const row = await env.DB.prepare(`SELECT * FROM value_model_state WHERE id = 1`).first<any>();
  return row ?? { status: "active", status_reason: null, evaluated_at: null, evaluation_json: null,
    coefficients_json: null, coefficients_version: null, retrained_at: null };
}

export function coefficientsFrom(state: StoredState): Coefficients {
  if (state.coefficients_json) {
    try { return JSON.parse(state.coefficients_json) as Coefficients; } catch { /* fall back */ }
  }
  return SHIPPED_COEFFICIENTS;
}

export interface LabelledRow {
  raceKey: string;
  raceDate: string;
  variant: Variant;
  pModel: number;
  pAgf: number | null;
  pGanyan: number | null;
  won: boolean;
  features: Array<number | null>;
}

export async function loadLabelled(env: Env, sinceDate: string): Promise<LabelledRow[]> {
  const rows = await env.DB.prepare(`
    SELECT race_date, city, race_number, variant, p_model, p_agf, p_ganyan, finish_position, features_json
    FROM value_model_predictions
    WHERE frozen_at IS NOT NULL AND finish_position IS NOT NULL AND race_date >= ?
  `).bind(sinceDate).all<any>();
  return (rows.results ?? []).map((r: any) => ({
    raceKey: `${r.race_date}|${r.city}|${r.race_number}`,
    raceDate: r.race_date,
    variant: r.variant,
    pModel: Number(r.p_model),
    pAgf: r.p_agf == null ? null : Number(r.p_agf),
    pGanyan: r.p_ganyan == null ? null : Number(r.p_ganyan),
    won: Number(r.finish_position) === 1,
    features: JSON.parse(r.features_json || "[]")
  }));
}

/* Races with exactly one winner; probabilities renormalised over the starters. */
export function groupRaces(rows: LabelledRow[]): LabelledRow[][] {
  const by = new Map<string, LabelledRow[]>();
  for (const r of rows) by.set(r.raceKey, [...(by.get(r.raceKey) ?? []), r]);
  const out: LabelledRow[][] = [];
  for (const race of by.values()) {
    if (race.length < 2 || race.filter(r => r.won).length !== 1) continue;
    const norm = (k: "pModel" | "pAgf" | "pGanyan") => {
      if (race.some(r => r[k] == null)) return race.forEach(r => { (r as any)[k] = null; });
      const total = race.reduce((s, r) => s + (r[k] as number), 0);
      race.forEach(r => { (r as any)[k] = (r[k] as number) / total; });
    };
    norm("pModel"); norm("pAgf"); norm("pGanyan");
    out.push(race);
  }
  return out.sort((a, b) => a[0].raceDate.localeCompare(b[0].raceDate));
}

function topHit(race: LabelledRow[], k: "pModel" | "pAgf" | "pGanyan", n: number): boolean {
  return [...race].sort((a, b) => (b[k] as number) - (a[k] as number)).slice(0, n).some(r => r.won);
}

export function evaluateRaces(races: LabelledRow[][]) {
  const diffs: number[] = [];
  let modelLl = 0, refLl = 0, top1Model = 0, top1Ref = 0, top3Model = 0, top3Ref = 0;
  let valueBets = 0, valueWins = 0, valueExpected = 0;
  for (const race of races) {
    const ref: "pAgf" | "pGanyan" = race[0].pAgf != null ? "pAgf" : "pGanyan";
    if (race[0][ref] == null) continue;
    const winner = race.find(r => r.won)!;
    const a = -Math.log(Math.max(winner.pModel, 1e-9));
    const b = -Math.log(Math.max(winner[ref] as number, 1e-9));
    modelLl += a; refLl += b; diffs.push(b - a);
    top1Model += +topHit(race, "pModel", 1); top1Ref += +topHit(race, ref, 1);
    top3Model += +topHit(race, "pModel", 3); top3Ref += +topHit(race, ref, 3);
    for (const r of race) {
      if (valueLabel(r.pModel, r[ref]) === "underrated") {
        valueBets++; valueWins += +r.won; valueExpected += r[ref] as number;
      }
    }
  }
  const n = diffs.length;
  const gain = n ? diffs.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(diffs.reduce((s, x) => s + (x - gain) ** 2, 0) / (n - 1)) : 0;
  const se = n ? sd / Math.sqrt(n) : 0;
  const pct = (x: number) => (n ? Math.round(1000 * x / n) / 10 : null);
  return {
    races: n,
    logLossModel: n ? modelLl / n : null,
    logLossReference: n ? refLl / n : null,
    gain, gainLow: gain - 1.96 * se, gainHigh: gain + 1.96 * se,
    top1ModelPct: pct(top1Model), top1ReferencePct: pct(top1Ref),
    top3ModelPct: pct(top3Model), top3ReferencePct: pct(top3Ref),
    underrated: { bets: valueBets, wins: valueWins, expectedByMarket: Math.round(valueExpected * 10) / 10 }
  };
}

export function gateDecision(e: ReturnType<typeof evaluateRaces>): { status: ValueModelStatus; reason: string } {
  if (e.races < EVALUATION_CONFIG.minRacesToJudge) {
    return { status: "active", reason: `only ${e.races} labelled races; trusting the backtest` };
  }
  if (e.gainHigh < 0 || (e.races >= 300 && e.gain < 0)) {
    return { status: "paused", reason: `model log-loss worse than the market by ${(-e.gain).toFixed(4)} over ${e.races} races` };
  }
  return { status: "active", reason: `model beats the market by ${e.gain.toFixed(4)} log-loss over ${e.races} races` };
}

export async function evaluateIfDue(env: Env, historyReady: boolean, force = false): Promise<StoredState> {
  const state = await loadState(env);
  const now = new Date();
  const due = force || !state.evaluated_at ||
    now.getTime() - Date.parse(state.evaluated_at) > EVALUATION_CONFIG.evaluateEveryDays * 86_400_000;

  if (!historyReady) {
    if (state.status !== "warming") {
      await env.DB.prepare(`UPDATE value_model_state SET status='warming', status_reason=? WHERE id=1`)
        .bind("result archive backfill still running").run();
    }
    return { ...state, status: "warming" };
  }
  if (!due && state.status !== "warming") return state;

  const rows = await loadLabelled(env, addDays(turkeyDate(), -365));
  const races = groupRaces(rows).slice(-EVALUATION_CONFIG.evaluationRaces);
  const evaluation = evaluateRaces(races);
  const decision = gateDecision(evaluation);
  await env.DB.prepare(`
    UPDATE value_model_state SET status=?, status_reason=?, evaluated_at=?, evaluation_json=? WHERE id=1
  `).bind(decision.status, decision.reason, now.toISOString(), JSON.stringify(evaluation)).run();
  return { ...state, status: decision.status, status_reason: decision.reason, evaluated_at: now.toISOString(), evaluation_json: JSON.stringify(evaluation) };
}

/* ---------- monthly refit (conditional logit, full-batch Adam) ---------- */

const ANCHOR: Record<Variant, "pGanyan" | "pAgf"> = { full: "pGanyan", ganyan: "pGanyan", agf: "pAgf" };

function variantRaces(races: LabelledRow[][], v: Variant): LabelledRow[][] {
  return races.filter(race => race.every(r =>
    (v === "agf" ? r.pAgf != null : r.pGanyan != null) && (v !== "full" || r.pAgf != null)));
}

interface Design { x: Float64Array[]; y: number[]; races: number[][]; cols: number }

function design(races: LabelledRow[][], v: Variant, spec: VariantCoefficients): Design {
  const idx = spec.features.map(f => VALUE_MODEL_FEATURES.indexOf(f.name as FeatureName));
  const cols = 1 + 2 * spec.features.length;
  const x: Float64Array[] = [], y: number[] = [], groups: number[][] = [];
  for (const race of races) {
    const g: number[] = [];
    for (const r of race) {
      const row = new Float64Array(cols);
      const p = r[ANCHOR[v]] as number;
      row[0] = Math.log(v === "agf" ? Math.max(p, 1e-4) : p);
      spec.features.forEach((f, j) => {
        const val = r.features[idx[j]];
        if (val == null) { row[1 + 2 * j + 1] = 1; return; }
        row[1 + 2 * j] = Math.max(-4, Math.min(4, (val - f.mean) / (f.sd || 1)));
      });
      g.push(x.length); x.push(row); y.push(r.won ? 1 : 0);
    }
    groups.push(g);
  }
  return { x, y, races: groups, cols };
}

function nll(d: Design, b: Float64Array, grad?: Float64Array): number {
  let total = 0;
  for (const g of d.races) {
    const u = g.map(i => { let s = 0; const row = d.x[i]; for (let k = 0; k < d.cols; k++) s += row[k] * b[k]; return s; });
    const m = Math.max(...u);
    const e = u.map(v => Math.exp(v - m));
    const z = e.reduce((s, v) => s + v, 0);
    g.forEach((i, j) => {
      const p = e[j] / z;
      if (d.y[i]) total -= Math.log(p);
      if (grad) { const row = d.x[i]; const w = p - d.y[i]; for (let k = 0; k < d.cols; k++) grad[k] += w * row[k]; }
    });
  }
  return total;
}

export function fitVariant(races: LabelledRow[][], v: Variant, template: VariantCoefficients, l2 = 5): VariantCoefficients {
  /* standardisation from the training rows */
  const features = template.features.map((f, j) => {
    const idx = VALUE_MODEL_FEATURES.indexOf(f.name as FeatureName);
    const vals = races.flat().map(r => r.features[idx]).filter((x): x is number => x != null);
    const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length - 1)) : 1;
    return { ...f, mean, sd: sd || 1, coef: 0, naCoef: 0 };
  });
  const spec: VariantCoefficients = { ...template, features };
  const d = design(races, v, spec);
  const b = new Float64Array(d.cols); b[0] = 1;
  const m = new Float64Array(d.cols), s = new Float64Array(d.cols);
  const lr = 0.02, b1 = 0.9, b2 = 0.999;
  for (let t = 1; t <= 600; t++) {
    const g = new Float64Array(d.cols);
    nll(d, b, g);
    for (let k = 1; k < d.cols; k++) g[k] += 2 * l2 * b[k];
    for (let k = 0; k < d.cols; k++) {
      m[k] = b1 * m[k] + (1 - b1) * g[k];
      s[k] = b2 * s[k] + (1 - b2) * g[k] * g[k];
      b[k] -= lr * (m[k] / (1 - b1 ** t)) / (Math.sqrt(s[k] / (1 - b2 ** t)) + 1e-8);
    }
  }
  return {
    ...spec,
    anchorCoef: b[0],
    races: races.length,
    features: features.map((f, j) => ({ ...f, coef: b[1 + 2 * j], naCoef: b[2 + 2 * j] }))
  };
}

export function holdoutLogLoss(races: LabelledRow[][], v: Variant, spec: VariantCoefficients): number {
  const d = design(races, v, spec);
  const b = new Float64Array(d.cols);
  b[0] = spec.anchorCoef;
  spec.features.forEach((f, j) => { b[1 + 2 * j] = f.coef; b[2 + 2 * j] = f.naCoef; });
  return d.races.length ? nll(d, b) / d.races.length : Infinity;
}

export async function retrainIfDue(env: Env, state: StoredState): Promise<void> {
  if (state.status === "warming") return;
  if (state.retrained_at && Date.now() - Date.parse(state.retrained_at) < EVALUATION_CONFIG.retrainEveryDays * 86_400_000) return;

  const current = coefficientsFrom(state);
  const races = groupRaces(await loadLabelled(env, addDays(turkeyDate(), -EVALUATION_CONFIG.retrainLookbackDays)));
  const summary: Record<string, unknown> = { races: races.length };
  const next: Coefficients = JSON.parse(JSON.stringify(current));
  let adopted = false;

  if (races.length >= EVALUATION_CONFIG.minRacesToRetrain) {
    for (const v of ["full", "ganyan", "agf"] as Variant[]) {
      const rv = variantRaces(races, v);
      if (rv.length < 500) { summary[v] = { races: rv.length, skipped: "too few races" }; continue; }
      const cut = Math.floor(rv.length * 0.8);
      const candidate = fitVariant(rv.slice(0, cut), v, current[v]);
      const before = holdoutLogLoss(rv.slice(cut), v, current[v]);
      const after = holdoutLogLoss(rv.slice(cut), v, candidate);
      const accept = before - after >= EVALUATION_CONFIG.minHoldoutGain;
      summary[v] = { races: rv.length, holdoutBefore: before, holdoutAfter: after, adopted: accept };
      if (accept) { next[v] = fitVariant(rv, v, current[v]); adopted = true; }
    }
  } else {
    summary.skipped = `needs ${EVALUATION_CONFIG.minRacesToRetrain} labelled races`;
  }

  const now = new Date().toISOString();
  if (adopted) next._meta = { ...current._meta, version: `value-retrained-${now.slice(0, 10)}` };
  await env.DB.prepare(`
    UPDATE value_model_state SET retrained_at=?, retrain_json=?,
      coefficients_json = COALESCE(?, coefficients_json), coefficients_version = COALESCE(?, coefficients_version)
    WHERE id=1
  `).bind(now, JSON.stringify(summary), adopted ? JSON.stringify(next) : null, adopted ? next._meta.version : null).run();
}
