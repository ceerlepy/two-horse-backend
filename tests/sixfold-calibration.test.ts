import {
  describe,
  expect,
  it
} from "vitest";

import {
  DEFAULT_COUPON_TEMPERATURE
} from "../src/coupons/optimizer";

import {
  classifyCalibrationStatus,
  computeCalibratedTemperature,
  SIXFOLD_CALIBRATION_CONFIG
} from "../src/coupons/calibration";

const MIN_CALIBRATION_SAMPLES =
  SIXFOLD_CALIBRATION_CONFIG.minSamples;

const CALIBRATION_FULL_RELIABILITY_SAMPLES =
  SIXFOLD_CALIBRATION_CONFIG.fullReliabilitySamples;


describe(
  "sixfold probability calibration",
  () => {
    it(
      "stays at the default temperature below the minimum sample gate",
      () => {
        expect(
          computeCalibratedTemperature({
            sampleCount:
              MIN_CALIBRATION_SAMPLES - 1,
            predictedAvgCoverage: 0.5,
            actualHitRate: 0.2
          })
        ).toBe(DEFAULT_COUPON_TEMPERATURE);
      }
    );


    it(
      "reports insufficient-data / partial / calibrated at the right sample counts",
      () => {
        expect(
          classifyCalibrationStatus(0)
        ).toBe("insufficient-data");

        expect(
          classifyCalibrationStatus(
            MIN_CALIBRATION_SAMPLES
          )
        ).toBe("partial");

        expect(
          classifyCalibrationStatus(
            CALIBRATION_FULL_RELIABILITY_SAMPLES
          )
        ).toBe("calibrated");
      }
    );


    it(
      "raises temperature (flattens the distribution) when we were overconfident",
      () => {
        const temperature =
          computeCalibratedTemperature({
            sampleCount:
              CALIBRATION_FULL_RELIABILITY_SAMPLES,

            predictedAvgCoverage: 0.60,
            actualHitRate: 0.40
          });

        expect(temperature)
          .toBeGreaterThan(
            DEFAULT_COUPON_TEMPERATURE
          );
      }
    );


    it(
      "lowers temperature (sharpens the distribution) when we were underconfident",
      () => {
        const temperature =
          computeCalibratedTemperature({
            sampleCount:
              CALIBRATION_FULL_RELIABILITY_SAMPLES,

            predictedAvgCoverage: 0.40,
            actualHitRate: 0.60
          });

        expect(temperature)
          .toBeLessThan(
            DEFAULT_COUPON_TEMPERATURE
          );
      }
    );


    it(
      "never moves the temperature by more than the bounded shift, even with an extreme bias",
      () => {
        const temperature =
          computeCalibratedTemperature({
            sampleCount:
              CALIBRATION_FULL_RELIABILITY_SAMPLES * 10,

            predictedAvgCoverage: 0.90,
            actualHitRate: 0.01
          });

        expect(temperature)
          .toBeLessThanOrEqual(
            DEFAULT_COUPON_TEMPERATURE * 1.30
          );

        expect(temperature)
          .toBeGreaterThanOrEqual(
            DEFAULT_COUPON_TEMPERATURE * 0.70
          );
      }
    );


    it(
      "scales the shift by reliability between the min and full-confidence sample counts",
      () => {
        const midway =
          computeCalibratedTemperature({
            sampleCount:
              (
                MIN_CALIBRATION_SAMPLES +
                CALIBRATION_FULL_RELIABILITY_SAMPLES
              ) / 2,

            predictedAvgCoverage: 0.60,
            actualHitRate: 0.40
          });

        const full =
          computeCalibratedTemperature({
            sampleCount:
              CALIBRATION_FULL_RELIABILITY_SAMPLES,

            predictedAvgCoverage: 0.60,
            actualHitRate: 0.40
          });

        const midwayShift =
          midway - DEFAULT_COUPON_TEMPERATURE;

        const fullShift =
          full - DEFAULT_COUPON_TEMPERATURE;

        expect(midwayShift)
          .toBeGreaterThan(0);

        expect(midwayShift)
          .toBeLessThan(fullShift);
      }
    );
  }
);
