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
 * Deliberately low: at ~6 samples per evaluated coupon (one six-fold
 * = six legs), 200 would need ~33 fully-evaluated coupons before this
 * moved at all, which this feature's real usage so far (6 generated,
 * 3 evaluated, ever) may never reach. 50 lets a first, heavily-
 * shrunk signal join in after roughly 8 coupons instead -- the
 * reliability ramp below still keeps that early signal small, it
 * just doesn't wait for a volume this feature hasn't shown yet.
 */
export const MIN_CALIBRATION_SAMPLES = 50;

export const CALIBRATION_FULL_RELIABILITY_SAMPLES = 300;

const MAX_TEMPERATURE_SHIFT = 0.30;


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
  if (sampleCount < MIN_CALIBRATION_SAMPLES) {
    return "insufficient-data";
  }

  if (sampleCount < CALIBRATION_FULL_RELIABILITY_SAMPLES) {
    return "partial";
  }

  return "calibrated";
}


/*
 * Stays at the uncalibrated default until MIN_CALIBRATION_SAMPLES is
 * met, then moves gradually (never more than +/-30%) as reliability
 * grows toward CALIBRATION_FULL_RELIABILITY_SAMPLES. One noisy early
 * batch can never swing this to an extreme.
 */
export function computeCalibratedTemperature(
  stats: CalibrationStats
): number {
  if (
    stats.sampleCount < MIN_CALIBRATION_SAMPLES ||
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
        MIN_CALIBRATION_SAMPLES
      ) /
      (
        CALIBRATION_FULL_RELIABILITY_SAMPLES -
        MIN_CALIBRATION_SAMPLES
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
    MAX_TEMPERATURE_SHIFT *
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
