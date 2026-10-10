import type { Env } from "../env";
import { turkeyDate } from "../shared";
import { observed } from "../observability/logger";
import { acquireLease, getState, isDue, markSuccess } from "../storage/state";
import { ARCHIVE_CONFIG, archiveCoverage, refreshResultArchive } from "./archive-service";
import { addDays } from "./cities";
import { EVALUATION_CONFIG, coefficientsFrom, evaluateIfDue, loadState, retrainIfDue } from "./evaluation";
import { GALLOP_CONFIG, refreshGallops } from "./gallops";
import { ODDS_CONFIG, refreshGanyanOdds } from "./odds";
import { freezeStartedRaces, labelPredictions, refreshPredictions, valueLabel } from "./predictions";

/*
 * One cron step for the value model. Order matters: freeze races that went
 * off before anything recomputes them, then gather inputs (odds, gallops,
 * archive), then predict, then label and evaluate.
 */
export async function refreshValueModel(env: Env): Promise<void> {
  if (!(await acquireLease(env, "value-model", 240))) return;

  await observed(env, "value-model.freeze", () => freezeStartedRaces(env));
  await observed(env, "value-model.odds", () => refreshGanyanOdds(env));
  await observed(env, "value-model.gallops", () => refreshGallops(env));
  await observed(env, "value-model.archive", () => refreshResultArchive(env));

  const today = turkeyDate();
  const coverage = await archiveCoverage(env, today);
  const historyReady =
    coverage.completeFrom != null &&
    coverage.completeFrom <= addDays(today, -EVALUATION_CONFIG.minHistoryDays);

  const state =
    (await observed(env, "value-model.evaluate", () => evaluateIfDue(env, historyReady))) ??
    (await loadState(env));
  if (historyReady) {
    await observed(env, "value-model.predict", () => refreshPredictions(env, coefficientsFrom(state)));
  }
  await observed(env, "value-model.label", () => labelPredictions(env));
  await observed(env, "value-model.retrain", () => retrainIfDue(env, state));
  await observed(env, "value-model.cleanup", () => cleanupValueModel(env));

  await markSuccess(env, "value-model");
}

/* Once a day: keep the archive and caches bounded. */
export async function cleanupValueModel(env: Env): Promise<void> {
  const key = "value-model.cleanup";
  if (!isDue(await getState(env, key), 24 * 3_600_000)) return;
  if (!(await acquireLease(env, key, 300))) return;
  const today = turkeyDate();
  const before = (days: number) => addDays(today, -days);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM result_archive_runners WHERE race_date < ?`).bind(before(ARCHIVE_CONFIG.retentionDays)),
    env.DB.prepare(`DELETE FROM result_archive_races WHERE race_date < ?`).bind(before(ARCHIVE_CONFIG.retentionDays)),
    env.DB.prepare(`DELETE FROM horse_gallops WHERE gallop_date < ?`).bind(before(GALLOP_CONFIG.retentionDays)),
    env.DB.prepare(`DELETE FROM horse_gallop_state WHERE fetched_at < ?`).bind(before(GALLOP_CONFIG.retentionDays)),
    env.DB.prepare(`DELETE FROM ganyan_odds_snapshots WHERE race_date < ?`).bind(before(ODDS_CONFIG.retentionDays)),
    env.DB.prepare(`DELETE FROM ganyan_odds_polls WHERE race_date < ?`).bind(before(ODDS_CONFIG.retentionDays)),
    env.DB.prepare(`DELETE FROM value_model_predictions WHERE race_date < ?`).bind(before(400))
  ]);
  await markSuccess(env, key);
}

/* ---------- read side: what /api/today shows ---------- */

export interface RunnerValue {
  probability: number;
  agfProbability: number | null;
  ganyanProbability: number | null;
  odds: number | null;
  valueRatio: number | null;
  label: "underrated" | "overrated" | null;
  variant: string;
  computedAt: string;
}

export async function loadTodayValues(env: Env, raceDate: string): Promise<{
  status: string;
  byRunner: Map<string, RunnerValue>;
}> {
  const state = await loadState(env);
  const byRunner = new Map<string, RunnerValue>();
  if (state.status !== "active") return { status: state.status, byRunner };
  const rows = await env.DB.prepare(`
    SELECT city, race_number, horse_number, variant, p_model, p_agf, p_ganyan, odds, value_ratio, computed_at
    FROM value_model_predictions WHERE race_date = ?
  `).bind(raceDate).all<any>();
  const round = (x: any, d = 4) => (x == null ? null : Math.round(Number(x) * 10 ** d) / 10 ** d);
  for (const r of rows.results ?? []) {
    const p = Number(r.p_model);
    const reference = r.p_agf ?? r.p_ganyan;
    byRunner.set(`${r.city}|${r.race_number}|${r.horse_number}`, {
      probability: round(p) as number,
      agfProbability: round(r.p_agf),
      ganyanProbability: round(r.p_ganyan),
      odds: r.odds == null ? null : Number(r.odds),
      valueRatio: round(r.value_ratio, 3),
      label: valueLabel(p, reference == null ? null : Number(reference)),
      variant: r.variant,
      computedAt: r.computed_at
    });
  }
  return { status: state.status, byRunner };
}

/* Adds runner.valueModel (and race.valueModelStatus) to getToday()'s meetings. */
export function attachValues(meetings: any[], values: { status: string; byRunner: Map<string, RunnerValue> }): any[] {
  for (const meeting of meetings) {
    for (const race of meeting.races ?? []) {
      race.valueModelStatus = values.status;
      for (const runner of race.runners ?? []) {
        const v = values.byRunner.get(`${meeting.city ?? race.city}|${race.race_number}|${runner.horse_number}`);
        if (v) runner.valueModel = v;
      }
      race.surpriseNumber = valueSurpriseNumber(race.runners ?? []);
    }
  }
  return meetings;
}

/*
 * The card's "Sürpriz": a horse the crowd does not rate (outside the AGF
 * top three) that the value model says AGF underrates, the strongest of
 * them by the model's chance. Owner's definition, 2026-10-10: "AGF'de 6.
 * 7. sırada ama model onu kuvvetlendiriyorsa o sürprizdir". Underrated
 * horses beat their AGF by ~14% in the archive walk-forward. Expert
 * "sürpriz" picks are not blended in: they won 0.78x their AGF. Null
 * when no such horse exists or AGF is incomplete; the app then falls
 * back to the best-scored horse outside the AGF top three.
 */
export function valueSurpriseNumber(runners: any[]): number | null {
  if (runners.length < 4 || runners.some(r => r.agf_percent == null || !Number.isFinite(Number(r.agf_percent)))) return null;
  const agfTopThree = new Set(
    [...runners]
      .sort((a, b) => Number(b.agf_percent) - Number(a.agf_percent) || a.horse_number - b.horse_number)
      .slice(0, 3)
      .map(r => r.horse_number)
  );
  let best: any = null;
  for (const runner of runners) {
    const v: RunnerValue | undefined = runner.valueModel;
    if (agfTopThree.has(runner.horse_number) || v?.label !== "underrated") continue;
    if (!best || v.probability > best.valueModel.probability) best = runner;
  }
  return best ? best.horse_number : null;
}

export async function valueModelStatus(env: Env): Promise<Record<string, unknown>> {
  const state = await loadState(env);
  const coverage = await archiveCoverage(env);
  return {
    status: state.status,
    reason: state.status_reason,
    evaluatedAt: state.evaluated_at,
    evaluation: state.evaluation_json ? JSON.parse(state.evaluation_json) : null,
    coefficientsVersion: state.coefficients_version ?? coefficientsFrom(state)._meta.version,
    retrainedAt: state.retrained_at,
    archive: { ...coverage, backfillStart: ARCHIVE_CONFIG.backfillStart, minHistoryDays: EVALUATION_CONFIG.minHistoryDays }
  };
}
