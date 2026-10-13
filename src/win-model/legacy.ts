import { SHIPPED_SCORE_COEFFICIENTS } from "../scoring/learned-score";
import { loadTodayValues } from "../value-model/service";
import type { WinModelStrategy } from "./strategy";

/*
 * The system before 2026-10-13: the model score (score-coefficients.json,
 * live races only) for cards and coupons, and the separate value model
 * (src/value-model, archive-trained) for the AGF view, Sürpriz and the
 * sürprizli coupon. Kept whole as the fallback.
 */
export const LEGACY_WIN_MODEL: WinModelStrategy = {
  id: "legacy",
  scoreCoefficients: SHIPPED_SCORE_COEFFICIENTS,
  loadValues: (env, raceDate) => loadTodayValues(env, raceDate)
};
