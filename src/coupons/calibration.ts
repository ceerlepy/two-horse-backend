import type {
  Env
} from "../env";

import {
  clamp,
  round
} from "../scoring/math";

import {
  DEFAULT_COUPON_TEMPERATURE
} from "./optimizer";


/*
 * Nothing checked whether the softmax's coverageProbability actually
 * predicted real sixfold outcomes -- it was a fixed hand-tuned
 * constant, forever. This calibrates it from the system's own
 * evaluated legs: if real hit rate runs below what we predicted, our
 * scores were too concentrated on the top picks (overconfident), and
 * a higher temperature spreads probability mass wider, which both
 * reports a more honest coverageProbability AND pushes the optimizer
 * to hedge with more horses per leg for the same target coverage.
 * The reverse (underconfident) sharpens it. A single leg is one
 * sample; a whole coupon is six.
 */
/*
 * Every tunable number for this feature lives here, in one place --
 * same pattern as EXPERT_CHECK_CADENCE_TIERS in src/experts/policy.ts.
 * Tune cost/aggressiveness of learning here, nowhere else.
 *
 * minSamples: deliberately low. At ~6 samples per evaluated coupon
 * (one six-fold = six legs), 200 would need ~33 fully-evaluated
 * coupons before this moved at all, which this feature's real usage
 * so far (6 generated, 3 evaluated, ever) may never reach. 50 lets a
 * first, heavily-shrunk signal join in after roughly 8 coupons
 * instead -- fullReliabilitySamples below still keeps that early
 * signal small, it just doesn't wait for a volume this feature
 * hasn't shown yet.
 *
 * fullReliabilitySamples: sample count at which the calibration is
 * trusted at its full strength. Below minSamples, no effect at all;
 * between the two, effect scales up linearly.
 *
 * maxTemperatureShift: hard cap on how far calibration can move the
 * temperature from its default, in either direction, even with an
 * extreme observed bias and unlimited samples.
 */
export const SIXFOLD_CALIBRATION_CONFIG = {
  minSamples: 50,
  fullReliabilitySamples: 300,
  maxTemperatureShift: 0.30
} as const;


export type CalibrationStatus =
  | "insufficient-data"
  | "partial"
  | "calibrated";


export interface CalibrationStats {
  sampleCount: number;
  predictedAvgCoverage: number;
  actualHitRate: number;
}


export function classifyCalibrationStatus(
  sampleCount: number
): CalibrationStatus {
  if (sampleCount < SIXFOLD_CALIBRATION_CONFIG.minSamples) {
    return "insufficient-data";
  }

  if (
    sampleCount <
    SIXFOLD_CALIBRATION_CONFIG.fullReliabilitySamples
  ) {
    return "partial";
  }

  return "calibrated";
}


/*
 * Stays at the uncalibrated default until SIXFOLD_CALIBRATION_CONFIG.
 * minSamples is met, then moves gradually (never more than +/-
 * maxTemperatureShift) as reliability grows toward
 * fullReliabilitySamples. One noisy early batch can never swing this
 * to an extreme.
 */
export function computeCalibratedTemperature(
  stats: CalibrationStats
): number {
  if (
    stats.sampleCount <
      SIXFOLD_CALIBRATION_CONFIG.minSamples ||
    stats.predictedAvgCoverage <= 0
  ) {
    return DEFAULT_COUPON_TEMPERATURE;
  }

  const bias =
    stats.actualHitRate -
    stats.predictedAvgCoverage;

  const reliability =
    clamp(
      (
        stats.sampleCount -
        SIXFOLD_CALIBRATION_CONFIG.minSamples
      ) /
      (
        SIXFOLD_CALIBRATION_CONFIG.fullReliabilitySamples -
        SIXFOLD_CALIBRATION_CONFIG.minSamples
      ),
      0,
      1
    );

  /*
   * Negative bias (actual < predicted) => overconfident =>
   * positive shift => higher temperature => flatter
   * distribution => lower future coverageProbability for the
   * same selection, which is the honest direction to move in.
   */
  const rawShift =
    clamp(
      -bias /
        Math.max(
          stats.predictedAvgCoverage,
          0.05
        ),
      -1,
      1
    );

  const shift =
    rawShift *
    SIXFOLD_CALIBRATION_CONFIG.maxTemperatureShift *
    reliability;

  return round(
    DEFAULT_COUPON_TEMPERATURE *
      (1 + shift),
    2
  );
}


export interface SixFoldCalibrationState {
  temperature: number;
  status: CalibrationStatus;
  sampleCount: number;
}


export async function recalibrateSixFoldProbabilities(
  env: Env
): Promise<SixFoldCalibrationState> {
  const row =
    await env.DB.prepare(`
      SELECT
        COUNT(*) sample_count,
        AVG(predicted_probability) predicted_avg,
        AVG(hit) actual_hit_rate
      FROM sixfold_leg_calibration_samples
    `)
      .first<any>();

  const sampleCount =
    Number(row?.sample_count ?? 0);

  const predictedAvgCoverage =
    Number(row?.predicted_avg ?? 0);

  const actualHitRate =
    Number(row?.actual_hit_rate ?? 0);

  const temperature =
    computeCalibratedTemperature({
      sampleCount,
      predictedAvgCoverage,
      actualHitRate
    });

  const status =
    classifyCalibrationStatus(
      sampleCount
    );

  const now =
    new Date()
      .toISOString();

  await env.DB.prepare(`
    INSERT INTO sixfold_probability_calibration(
      id,
      sample_count,
      predicted_avg_coverage,
      actual_hit_rate,
      temperature,
      status,
      updated_at
    )
    VALUES(1, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(id)
    DO UPDATE SET
      sample_count = excluded.sample_count,
      predicted_avg_coverage = excluded.predicted_avg_coverage,
      actual_hit_rate = excluded.actual_hit_rate,
      temperature = excluded.temperature,
      status = excluded.status,
      updated_at = excluded.updated_at
  `)
    .bind(
      sampleCount,
      predictedAvgCoverage,
      actualHitRate,
      temperature,
      status,
      now
    )
    .run();

  return {
    temperature,
    status,
    sampleCount
  };
}


export async function currentSixFoldTemperature(
  env: Env
): Promise<number> {
  const row =
    await env.DB.prepare(`
      SELECT temperature
      FROM sixfold_probability_calibration
      WHERE id = 1
    `)
      .first<any>();

  const temperature =
    Number(
      row?.temperature ??
        DEFAULT_COUPON_TEMPERATURE
    );

  return Number.isFinite(temperature)
    ? temperature
    : DEFAULT_COUPON_TEMPERATURE;
}


/*
 * Beşli Ganyan (5-leg) mirror of the two functions above. Reuses the
 * same pure classifyCalibrationStatus/computeCalibratedTemperature
 * math (already leg-count-agnostic) against its own sample/state
 * tables, since a 5-leg pool's real hit-rate bias should not be
 * blended with the 6-leg pool's.
 */
export async function recalibrateFiveFoldProbabilities(
  env: Env
): Promise<SixFoldCalibrationState> {
  const row =
    await env.DB.prepare(`
      SELECT
        COUNT(*) sample_count,
        AVG(predicted_probability) predicted_avg,
        AVG(hit) actual_hit_rate
      FROM fivefold_leg_calibration_samples
    `)
      .first<any>();

  const sampleCount =
    Number(row?.sample_count ?? 0);

  const predictedAvgCoverage =
    Number(row?.predicted_avg ?? 0);

  const actualHitRate =
    Number(row?.actual_hit_rate ?? 0);

  const temperature =
    computeCalibratedTemperature({
      sampleCount,
      predictedAvgCoverage,
      actualHitRate
    });

  const status =
    classifyCalibrationStatus(
      sampleCount
    );

  const now =
    new Date()
      .toISOString();

  await env.DB.prepare(`
    INSERT INTO fivefold_probability_calibration(
      id,
      sample_count,
      predicted_avg_coverage,
      actual_hit_rate,
      temperature,
      status,
      updated_at
    )
    VALUES(1, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(id)
    DO UPDATE SET
      sample_count = excluded.sample_count,
      predicted_avg_coverage = excluded.predicted_avg_coverage,
      actual_hit_rate = excluded.actual_hit_rate,
      temperature = excluded.temperature,
      status = excluded.status,
      updated_at = excluded.updated_at
  `)
    .bind(
      sampleCount,
      predictedAvgCoverage,
      actualHitRate,
      temperature,
      status,
      now
    )
    .run();

  return {
    temperature,
    status,
    sampleCount
  };
}


export async function currentFiveFoldTemperature(
  env: Env
): Promise<number> {
  const row =
    await env.DB.prepare(`
      SELECT temperature
      FROM fivefold_probability_calibration
      WHERE id = 1
    `)
      .first<any>();

  const temperature =
    Number(
      row?.temperature ??
        DEFAULT_COUPON_TEMPERATURE
    );

  return Number.isFinite(temperature)
    ? temperature
    : DEFAULT_COUPON_TEMPERATURE;
}
