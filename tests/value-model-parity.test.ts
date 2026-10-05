import { describe, expect, it } from "vitest";

import fixture from "./fixtures/value-model-parity.json";
import {
  VALUE_MODEL_FEATURES,
  computeFeatures,
  marketProbabilities,
  type FeatureContext,
  type Gallop,
  type JockeyWindow,
  type PastRun
} from "../src/value-model/features";
import { SHIPPED_COEFFICIENTS, chooseVariant, scoreRace } from "../src/value-model/model";

/*
 * Golden parity: three real races (2026-09-20) with their full pre-race
 * inputs, and the features/probabilities the offline Python pipeline
 * produced for them. The Worker must reproduce them, otherwise the shipped
 * coefficients do not mean what they were trained to mean.
 */

function context(race: any): FeatureContext {
  const toMap = <T>(o: Record<string, T>) => new Map<number, T>(Object.entries(o).map(([k, v]) => [Number(k), v]));
  return {
    raceDate: race.raceDate,
    distanceMeters: race.distanceMeters,
    surface: race.surface,
    history: toMap<PastRun[]>(race.history),
    jockeys: toMap<JockeyWindow>(race.jockeys),
    gallops: toMap<Gallop[]>(race.gallops)
  };
}

describe("value model parity with the offline pipeline", () => {
  for (const race of fixture as any[]) {
    it(`reproduces features and probabilities for ${race.raceDate} (${race.expected.variant})`, () => {
      const features = computeFeatures(context(race), race.runners);
      for (const name of VALUE_MODEL_FEATURES) {
        const expected: Array<number | null> = race.expected.features[name];
        features.forEach((f, i) => {
          if (expected[i] == null) expect(f[name], name).toBeNull();
          else expect(f[name], `${name} #${i}`).toBeCloseTo(expected[i] as number, 6);
        });
      }

      const { pAgf, pGanyan } = marketProbabilities(race.runners);
      const variant = chooseVariant(pAgf, pGanyan);
      expect(variant).toBe(race.expected.variant);

      const p = scoreRace(SHIPPED_COEFFICIENTS, variant!, features, pAgf, pGanyan);
      p.forEach((v, i) => expect(v).toBeCloseTo(race.expected.pModel[i], 6));
      expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);

      if (race.expected.pModelAgf) {
        const pa = scoreRace(SHIPPED_COEFFICIENTS, "agf", features, pAgf, pGanyan);
        pa.forEach((v, i) => expect(v).toBeCloseTo(race.expected.pModelAgf[i], 6));
      }
    });
  }

  it("needs a market anchor", () => {
    expect(chooseVariant([null, 0.5], [null, null])).toBeNull();
    expect(chooseVariant([0.4, 0.6], [null, 0.5])).toBe("agf");
    expect(chooseVariant([null, null], [0.4, 0.6])).toBe("ganyan");
  });
});
