import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import probables from "./fixtures/tjk-muhtemeller-adana-1.json";
import { toCompactRace, toCompactRunner } from "../src/api/compact-projection";
import { stripPremiumRaceSignals, stripPremiumRunnerSignals } from "../src/membership/tier";
import { VALUE_MODEL_FEATURES } from "../src/value-model/features";
import { parseGallops } from "../src/value-model/gallops";
import { SHIPPED_COEFFICIENTS } from "../src/value-model/model";
import { parseGanyanProbables } from "../src/value-model/odds";
import { valueLabel } from "../src/value-model/predictions";
import { attachValues, type RunnerValue } from "../src/value-model/service";
import {
  evaluateRaces,
  fitVariant,
  gateDecision,
  groupRaces,
  holdoutLogLoss,
  type LabelledRow
} from "../src/value-model/evaluation";

describe("TJK idman parser", () => {
  const html = readFileSync(new URL("./fixtures/tjk-idman-103593.html", import.meta.url), "utf8");

  it("reads gallops oldest first with split seconds", () => {
    const gallops = parseGallops(html);
    expect(gallops.map(g => g.date)).toEqual(["2026-09-18", "2026-09-25", "2026-10-04"]);
    expect(gallops[0]).toMatchObject({ effort: "R", hippodrome: "Adana", surface: "Kum", kind: "Galop" });
    expect(gallops[0].splits).toEqual({ "600": 42.6, "400": 28.3 });
    expect(gallops[1].splits).toEqual({ "600": 45.2, "400": 30 });
    expect(gallops[2]).toMatchObject({ effort: "ÇR", kind: "Sprint", splits: { "400": 29.5 } });
  });

  it("returns nothing for a page without the table", () => {
    expect(parseGallops("<html><body>Kayıt bulunamadı</body></html>")).toEqual([]);
  });
});

describe("TJK muhtemeller (ganyan) parser", () => {
  it("keeps every horse, nulls scratched odds", () => {
    const rows = parseGanyanProbables(probables)!;
    expect(rows).toHaveLength(11);
    expect(rows.filter(r => r.scratched).map(r => r.horseNumber)).toEqual([1, 10]);
    expect(rows.find(r => r.horseNumber === 1)!.odds).toBeNull();
    expect(rows.find(r => r.horseNumber === 6)!.odds).toBe(2.4);
    expect(rows.find(r => r.horseNumber === 4)!.odds).toBe(32.45);
  });

  it("treats 999.99 as no money yet and missing GANYAN as unavailable", () => {
    const payload = { data: { muhtemeller: { bahisler: [{ B: "GANYAN", muhtemeller: [{ S1: "3", G: "999.99" }] }] } } };
    expect(parseGanyanProbables(payload)).toEqual([{ horseNumber: 3, odds: null, scratched: false }]);
    expect(parseGanyanProbables({ data: { muhtemeller: { bahisler: [] } } })).toBeNull();
  });
});

describe("value label", () => {
  it("flags horses the market underrates or overrates", () => {
    expect(valueLabel(0.12, 0.08)).toBe("underrated");
    expect(valueLabel(0.036, 0.02)).toBeNull(); // too unlikely to matter
    expect(valueLabel(0.2, 0.3)).toBe("overrated");
    expect(valueLabel(0.05, 0.08)).toBeNull(); // reference below 10%
    expect(valueLabel(0.1, 0.1)).toBeNull();
    expect(valueLabel(0.1, null)).toBeNull();
  });
});

/* Synthetic races where the winner follows a known conditional logit. */
function syntheticRaces(n: number, trueCoef: number, seed = 7): LabelledRow[][] {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const fi = VALUE_MODEL_FEATURES.indexOf("fig_best3_rel");
  const races: LabelledRow[][] = [];
  for (let k = 0; k < n; k++) {
    const size = 8;
    const raw = Array.from({ length: size }, () => Math.exp(normal()));
    const total = raw.reduce((a, b) => a + b, 0);
    const market = raw.map(x => x / total);
    const fig = Array.from({ length: size }, () => normal());
    const u = market.map((p, i) => Math.log(p) + trueCoef * fig[i]);
    const e = u.map(Math.exp);
    const z = e.reduce((a, b) => a + b, 0);
    let r = rand() * z, winner = size - 1;
    for (let i = 0; i < size; i++) { r -= e[i]; if (r <= 0) { winner = i; break; } }
    races.push(market.map((p, i) => {
      const features: Array<number | null> = VALUE_MODEL_FEATURES.map(() => null);
      features[fi] = fig[i];
      return {
        raceKey: `2026-01-01|X|${k}`, raceDate: `2026-${String(1 + (k % 12)).padStart(2, "0")}-01`,
        variant: "ganyan", pModel: e[i] / z, pAgf: null, pGanyan: p, won: i === winner, features
      };
    }));
  }
  return races;
}

describe("value model evaluation", () => {
  it("drops races without exactly one winner and renormalises", () => {
    const row = (horse: number, won: boolean, p: number): LabelledRow => ({
      raceKey: "d|c|1", raceDate: "2026-10-01", variant: "ganyan",
      pModel: p, pAgf: null, pGanyan: p * 2, won, features: []
    });
    const races = groupRaces([row(1, true, 0.3), row(2, false, 0.2), { ...row(3, false, 0.5), raceKey: "d|c|2" }]);
    expect(races).toHaveLength(1);
    expect(races[0].map(r => r.pModel)).toEqual([0.6, 0.4]);
    expect(races[0][0].pGanyan).toBeCloseTo(0.6);
  });

  it("pauses only when the model is clearly worse than the market", () => {
    const races = syntheticRaces(400, 0.5);
    const good = evaluateRaces(races);
    expect(good.gain).toBeGreaterThan(0);
    expect(gateDecision(good).status).toBe("active");

    const reversed = races.map(race => race.map(r => ({ ...r, pModel: r.pGanyan!, pGanyan: r.pModel })));
    const bad = evaluateRaces(reversed);
    expect(bad.gain).toBeLessThan(0);
    expect(gateDecision(bad).status).toBe("paused");

    expect(gateDecision(evaluateRaces(reversed.slice(0, 50))).status).toBe("active");
  });

  it("refit recovers a known coefficient and beats the bare market", () => {
    const races = syntheticRaces(1500, 0.5);
    const template = { ...SHIPPED_COEFFICIENTS.ganyan, features: SHIPPED_COEFFICIENTS.ganyan.features.filter(f => f.name === "fig_best3_rel") };
    const fit = fitVariant(races.slice(0, 1200), "ganyan", template, 0.5);
    expect(fit.anchorCoef).toBeGreaterThan(0.8);
    expect(fit.anchorCoef).toBeLessThan(1.2);
    expect(fit.features[0].coef).toBeGreaterThan(0.35);
    expect(fit.features[0].coef).toBeLessThan(0.65);
    const marketOnly = { ...template, anchorCoef: 1, features: template.features.map(f => ({ ...f, coef: 0, naCoef: 0 })) };
    expect(holdoutLogLoss(races.slice(1200), "ganyan", fit)).toBeLessThan(holdoutLogLoss(races.slice(1200), "ganyan", marketOnly));
  });
});

describe("value model in /api/today", () => {
  const value: RunnerValue = {
    probability: 0.21, agfProbability: 0.12, ganyanProbability: 0.14, odds: 5.2,
    valueRatio: 1.75, label: "underrated", variant: "full", computedAt: "2026-10-05T10:00:00Z"
  };

  it("attaches per runner and survives the compact projection", () => {
    const meetings = attachValues(
      [{ city: "Adana", races: [{ race_number: 1, runners: [{ horse_number: 6 }, { horse_number: 7 }] }] }],
      { status: "active", byRunner: new Map([["Adana|1|6", value]]) }
    );
    const race = meetings[0].races[0];
    expect(race.valueModelStatus).toBe("active");
    expect(race.runners[0].valueModel).toEqual(value);
    expect(race.runners[1].valueModel).toBeUndefined();
    expect(toCompactRunner(race.runners[0]).valueModel).toMatchObject({ probability: 0.21, label: "underrated", odds: 5.2 });
    expect(toCompactRace(race).valueModelStatus).toBe("active");
  });

  it("is a premium signal", () => {
    expect(stripPremiumRunnerSignals({ horse_number: 6, valueModel: value }).valueModel).toBeUndefined();
    expect(stripPremiumRaceSignals({ race_number: 1, valueModelStatus: "active" }).valueModelStatus).toBeUndefined();
  });
});
