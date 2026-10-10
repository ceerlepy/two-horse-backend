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
 * coefficients on the last year of races (archive training rows from
 * training.ts, replaced by the frozen live prediction wherever one exists)
 * and adopt a variant only if it beats the coefficients in use on the
 * newest 20% of races by minHoldoutGain with a 95% interval above zero.
 * One variant is fitted per tick to stay inside the cron CPU budget.
 */
export const EVALUATION_CONFIG = {
  evaluateEveryDays: 7,
  evaluationRaces: 500,
  minRacesToJudge: 150,
  retrainEveryDays: 30,
  minRacesToRetrain: 1500,
  retrainLookbackDays: 365,
  minHoldoutGain: 0.002,
  minHistoryDays: 200,
  /* a skipped refit (too few races) is retried this often */
  retrySkippedDays: 1
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
  retrain_json?: string | null;
}

export async function loadState(env: Env): Promise<StoredState> {
  const row = await env.DB.prepare(`SELECT * FROM value_model_state WHERE id = 1`).first<any>();
  return row ?? { status: "active", status_reason: null, evaluated_at: null, evaluation_json: null,
    coefficients_json: null, coefficients_version: null, retrained_at: null, retrain_json: null };
}

export function coefficientsFrom(state: StoredState): Coefficients {
  if (state.coefficients_json) {
    try { return JSON.parse(state.coefficients_json) as Coefficients; } catch { /* fall back */ }
  }
  return SHIPPED_COEFFICIENTS;
}

export interface LabelledRow {
  raceKey: string;
  raceCode?: number | null;
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
    SELECT race_date, city, race_number, race_code, variant, p_model, p_agf, p_ganyan, finish_position, features_json
    FROM value_model_predictions
    WHERE frozen_at IS NOT NULL AND finish_position IS NOT NULL AND race_date >= ?
  `).bind(sinceDate).all<any>();
  return (rows.results ?? []).map((r: any) => ({
    raceKey: `${r.race_date}|${r.city}|${r.race_number}`,
    raceCode: r.race_code == null ? null : Number(r.race_code),
    raceDate: r.race_date,
    variant: r.variant,
    pModel: Number(r.p_model),
    pAgf: r.p_agf == null ? null : Number(r.p_agf),
    pGanyan: r.p_ganyan == null ? null : Number(r.p_ganyan),
    won: Number(r.finish_position) === 1,
    features: JSON.parse(r.features_json || "[]")
  }));
}

/* Archive training rows (training.ts); pModel is unused by the refit and set to the market. */
export async function loadArchiveTraining(env: Env, sinceDate: string): Promise<LabelledRow[]> {
  const rows = await env.DB.prepare(`
    SELECT race_code, race_date, variant, p_agf, p_ganyan, won, features_json
    FROM value_model_training_rows WHERE race_date >= ?
  `).bind(sinceDate).all<any>();
  return (rows.results ?? []).map((r: any) => {
    const pAgf = r.p_agf == null ? null : Number(r.p_agf);
    const pGanyan = r.p_ganyan == null ? null : Number(r.p_ganyan);
    return {
      raceKey: `archive|${r.race_code}`,
      raceCode: Number(r.race_code),
      raceDate: r.race_date,
      variant: r.variant,
      pModel: (pGanyan ?? pAgf) as number,
      pAgf,
      pGanyan,
      won: Number(r.won) === 1,
      features: JSON.parse(r.features_json || "[]")
    };
  });
}

/* Live frozen rows win over archive rows of the same race (they carry the bet-time market). */
export function mergeTrainingRows(live: LabelledRow[], archive: LabelledRow[]): LabelledRow[] {
  const liveCodes = new Set(live.map(r => r.raceCode).filter((x): x is number => x != null));
  return [...archive.filter(r => !liveCodes.has(r.raceCode as number)), ...live];
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

interface Design { x: Float64Array; y: Uint8Array; starts: Int32Array; cols: number }

/* Flat row-major design matrix; starts[r]..starts[r+1] are race r's rows. */
function design(races: LabelledRow[][], v: Variant, spec: VariantCoefficients): Design {
  const idx = spec.features.map(f => VALUE_MODEL_FEATURES.indexOf(f.name as FeatureName));
  const cols = 1 + 2 * spec.features.length;
  const n = races.reduce((s, race) => s + race.length, 0);
  const x = new Float64Array(n * cols), y = new Uint8Array(n), starts = new Int32Array(races.length + 1);
  let i = 0;
  races.forEach((race, g) => {
    starts[g] = i;
    for (const r of race) {
      const o = i * cols;
      const p = r[ANCHOR[v]] as number;
      x[o] = Math.log(v === "agf" ? Math.max(p, 1e-4) : p);
      spec.features.forEach((f, j) => {
        const val = r.features[idx[j]];
        if (val == null) { x[o + 2 + 2 * j] = 1; return; }
        x[o + 1 + 2 * j] = Math.max(-4, Math.min(4, (val - f.mean) / (f.sd || 1)));
      });
      y[i] = r.won ? 1 : 0;
      i++;
    }
  });
  starts[races.length] = i;
  return { x, y, starts, cols };
}

/* Per-race negative log-likelihood; adds the gradient into grad when given. */
function raceLosses(d: Design, b: Float64Array, grad?: Float64Array): Float64Array {
  const { x, y, starts, cols } = d;
  const losses = new Float64Array(starts.length - 1);
  const u = new Float64Array(64);
  for (let g = 0; g + 1 < starts.length; g++) {
    const a = starts[g], n = starts[g + 1] - a;
    const buf = n <= u.length ? u : new Float64Array(n);
    let max = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = (a + i) * cols;
      let s = 0;
      for (let k = 0; k < cols; k++) s += x[o + k] * b[k];
      buf[i] = s;
      if (s > max) max = s;
    }
    let z = 0;
    for (let i = 0; i < n; i++) { buf[i] = Math.exp(buf[i] - max); z += buf[i]; }
    for (let i = 0; i < n; i++) {
      const p = buf[i] / z;
      if (y[a + i]) losses[g] = -Math.log(p);
      if (grad) {
        const w = p - y[a + i], o = (a + i) * cols;
        for (let k = 0; k < cols; k++) grad[k] += w * x[o + k];
      }
    }
  }
  return losses;
}

/*
 * warmStart: begin from these coefficients (same feature list) and run
 * fewer steps; used for the full-data refit after the holdout fit.
 */
export function fitVariant(
  races: LabelledRow[][], v: Variant, template: VariantCoefficients, l2 = 5,
  warmStart: VariantCoefficients | null = null, steps = 600
): VariantCoefficients {
  /* standardisation from the training rows */
  const features = template.features.map(f => {
    const idx = VALUE_MODEL_FEATURES.indexOf(f.name as FeatureName);
    const vals = races.flat().map(r => r.features[idx]).filter((x): x is number => x != null);
    const mean = vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : 0;
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (vals.length - 1)) : 1;
    return { ...f, mean, sd: sd || 1, coef: 0, naCoef: 0 };
  });
  const spec: VariantCoefficients = { ...template, features };
  const d = design(races, v, spec);
  const b = warmStart ? coefficientVector(warmStart, d.cols) : new Float64Array(d.cols);
  if (!warmStart) b[0] = 1;
  const m = new Float64Array(d.cols), s = new Float64Array(d.cols);
  const lr = 0.02, b1 = 0.9, b2 = 0.999;
  for (let t = 1; t <= steps; t++) {
    const g = new Float64Array(d.cols);
    raceLosses(d, b, g);
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

function coefficientVector(spec: VariantCoefficients, cols: number): Float64Array {
  const b = new Float64Array(cols);
  b[0] = spec.anchorCoef;
  spec.features.forEach((f, j) => { b[1 + 2 * j] = f.coef; b[2 + 2 * j] = f.naCoef; });
  return b;
}

export function holdoutLogLoss(races: LabelledRow[][], v: Variant, spec: VariantCoefficients): number {
  const d = design(races, v, spec);
  const losses = raceLosses(d, coefficientVector(spec, d.cols));
  return losses.length ? losses.reduce((s, x) => s + x, 0) / losses.length : Infinity;
}

/* Paired per-race comparison on the same races: mean log-loss gain and its 95% interval. */
export function holdoutComparison(races: LabelledRow[][], v: Variant, current: VariantCoefficients, candidate: VariantCoefficients) {
  const a = raceLosses(design(races, v, current), coefficientVector(current, 1 + 2 * current.features.length));
  const b = raceLosses(design(races, v, candidate), coefficientVector(candidate, 1 + 2 * candidate.features.length));
  const n = a.length;
  const diffs = Array.from(a, (x, i) => x - b[i]);
  const gain = n ? diffs.reduce((s, x) => s + x, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(diffs.reduce((s, x) => s + (x - gain) ** 2, 0) / (n - 1)) : 0;
  const se = n ? sd / Math.sqrt(n) : 0;
  const mean = (l: Float64Array) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : Infinity);
  return { races: n, before: mean(a), after: mean(b), gain, gainLow: gain - 1.96 * se, gainHigh: gain + 1.96 * se };
}

export function acceptRefit(c: ReturnType<typeof holdoutComparison>): boolean {
  return c.gain >= EVALUATION_CONFIG.minHoldoutGain && c.gainLow > 0;
}

const VARIANTS: Variant[] = ["full", "ganyan", "agf"];
const PROGRESS_KEY = "retrain-progress";

interface RetrainProgress {
  startedAt: string;
  done: Variant[];
  next: Coefficients;
  adopted: boolean;
  summary: Record<string, unknown>;
}

export async function loadRetrainRaces(env: Env): Promise<LabelledRow[][]> {
  const since = addDays(turkeyDate(), -EVALUATION_CONFIG.retrainLookbackDays);
  const [live, archive] = await Promise.all([loadLabelled(env, since), loadArchiveTraining(env, since)]);
  return groupRaces(mergeTrainingRows(live, archive));
}

export function retrainDue(state: StoredState, now = Date.now()): boolean {
  if (state.status === "warming") return false;
  if (!state.retrained_at) return true;
  const age = now - Date.parse(state.retrained_at);
  let skipped = false;
  try { skipped = Boolean(JSON.parse(state.retrain_json || "{}").skipped); } catch { /* treat as a real run */ }
  const every = skipped ? EVALUATION_CONFIG.retrySkippedDays : EVALUATION_CONFIG.retrainEveryDays;
  return age >= every * 86_400_000;
}

/* Fits one variant per call; the last one writes the outcome to value_model_state. */
export async function retrainIfDue(env: Env, state: StoredState, trainingReady = true): Promise<void> {
  const saved = await env.DB.prepare(`SELECT value_json FROM value_model_cache WHERE cache_key = ?`)
    .bind(PROGRESS_KEY).first<any>();
  let progress: RetrainProgress | null = saved ? JSON.parse(saved.value_json) : null;
  if (!progress && (!trainingReady || !retrainDue(state))) return;

  const races = await loadRetrainRaces(env);
  const now = new Date().toISOString();

  if (!progress) {
    if (races.length < EVALUATION_CONFIG.minRacesToRetrain) {
      await env.DB.prepare(`UPDATE value_model_state SET retrained_at=?, retrain_json=? WHERE id=1`)
        .bind(now, JSON.stringify({ races: races.length, skipped: `needs ${EVALUATION_CONFIG.minRacesToRetrain} labelled races` }))
        .run();
      return;
    }
    progress = { startedAt: now, done: [], next: JSON.parse(JSON.stringify(coefficientsFrom(state))), adopted: false, summary: { races: races.length } };
  }

  const v = VARIANTS.find(x => !progress!.done.includes(x));
  if (v) {
    const current = progress.next[v];
    const rv = variantRaces(races, v);
    if (rv.length < 500) {
      progress.summary[v] = { races: rv.length, skipped: "too few races" };
    } else {
      const cut = Math.floor(rv.length * 0.8);
      const candidate = fitVariant(rv.slice(0, cut), v, current);
      const comparison = holdoutComparison(rv.slice(cut), v, current, candidate);
      const accept = acceptRefit(comparison);
      progress.summary[v] = { races: rv.length, holdout: comparison, adopted: accept };
      if (accept) { progress.next[v] = fitVariant(rv, v, current, 5, candidate, 200); progress.adopted = true; }
    }
    progress.done.push(v);
  }

  if (progress.done.length < VARIANTS.length) {
    await env.DB.prepare(`
      INSERT INTO value_model_cache(cache_key, value_json, updated_at) VALUES(?,?,?)
      ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at
    `).bind(PROGRESS_KEY, JSON.stringify(progress), now).run();
    return;
  }

  const next = progress.next;
  if (progress.adopted) next._meta = { ...next._meta, version: `value-retrained-${now.slice(0, 10)}`, trainedTo: now.slice(0, 10) };
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE value_model_state SET retrained_at=?, retrain_json=?,
        coefficients_json = COALESCE(?, coefficients_json), coefficients_version = COALESCE(?, coefficients_version)
      WHERE id=1
    `).bind(now, JSON.stringify(progress.summary), progress.adopted ? JSON.stringify(next) : null,
      progress.adopted ? next._meta.version : null),
    env.DB.prepare(`DELETE FROM value_model_cache WHERE cache_key = ?`).bind(PROGRESS_KEY)
  ]);
}
