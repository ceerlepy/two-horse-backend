import coefficients from "../scoring/data/unified-coefficients.json";
import type { LearnedScoreCoefficients } from "../scoring/learned-score";
import { isoNow } from "../shared";
import { valueLabel } from "../value-model/predictions";
import type { RunnerValue } from "../value-model/service";
import { runnerValueKey, type ScoredMeeting, type ValueView, type WinModelStrategy } from "./strategy";

export const UNIFIED_SCORE_COEFFICIENTS =
  coefficients as unknown as LearnedScoreCoefficients;

/*
 * The single model (owner's decision, 2026-10-13): one AGF-anchored
 * conditional logit fitted jointly on the last year of the result archive
 * plus live races, with all value-model features and our live components
 * (experts, market moves). Fitting them together keeps correlated signals
 * (speed figure, specialist figure, gallops) from being counted twice.
 * The AGF view is then just this model's chance next to the AGF share, so
 * card, Sürpriz and both coupon kinds read one opinion.
 *
 * Measured (/mnt/project-files/analysis/tek-model-testi-2026-10-13):
 * 493 live races, weekly walk-forward, log-loss 1.8547 vs 1.8685 for the
 * legacy score (+0.0138, 95% CI +0.0021..+0.0260); top-1 33.3% vs 33.9%
 * (12 vs 15 discordant races, p 0.70), top-3 66.3% both. Archive, 4,233
 * races: level with the value model (+0.0088 vs +0.0090 over AGF); 579
 * altılı sürprizli coupons 365 vs 385 hits over three budgets (noise).
 */
export function unifiedValues(meetings: ScoredMeeting[], computedAt = isoNow()): ValueView {
  const byRunner = new Map<string, RunnerValue>();
  for (const meeting of meetings) {
    for (const race of meeting.races ?? []) {
      const runners: any[] = race.runners ?? [];
      const agfTotal = runners.reduce((sum, r) => sum + Math.max(0, Number(r.agf_percent) || 0), 0);
      if (!(agfTotal > 0)) continue;
      for (const runner of runners) {
        const p = runner.modelScore?.scoreSource === "learned" ? Number(runner.modelScore.winProbability) : NaN;
        if (!Number.isFinite(p) || p <= 0) continue;
        const agf = Math.max(0, Number(runner.agf_percent) || 0) / agfTotal;
        const city = String(meeting.city ?? race.city);
        byRunner.set(runnerValueKey(city, Number(race.race_number), Number(runner.horse_number)), {
          probability: round(p),
          agfProbability: round(agf),
          ganyanProbability: null,
          odds: null,
          valueRatio: agf > 0 ? round(p / agf, 3) : null,
          label: valueLabel(p, agf),
          variant: "unified",
          computedAt
        });
      }
    }
  }
  return { status: "active", byRunner };
}

function round(x: number, digits = 4): number {
  return Math.round(x * 10 ** digits) / 10 ** digits;
}

export const UNIFIED_WIN_MODEL: WinModelStrategy = {
  id: "unified",
  scoreCoefficients: UNIFIED_SCORE_COEFFICIENTS,
  loadValues: async (_env, _raceDate, meetings) => unifiedValues(meetings)
};
