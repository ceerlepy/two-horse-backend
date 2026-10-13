import { describe, expect, it } from "vitest";
import { SHIPPED_SCORE_COEFFICIENTS, learnedWinProbabilities } from "../src/scoring/learned-score";
import { scoreRace } from "../src/scoring/race-score";
import { VALUE_MODEL_FEATURES } from "../src/value-model/features";
import { valueSurpriseNumber, attachValues } from "../src/value-model/service";
import { LEGACY_WIN_MODEL } from "../src/win-model/legacy";
import { DEFAULT_WIN_MODEL, WIN_MODELS, isWinModelId, loadActiveWinModel, loadValuesWithFallback, resolveWinModel } from "../src/win-model/registry";
import { UNIFIED_SCORE_COEFFICIENTS, UNIFIED_WIN_MODEL, unifiedValues } from "../src/win-model/unified";

const LIVE_COMPONENTS = ["expert_score", "form_score", "market_score", "hp_score", "weight_score", "field_score"];

function envWith(row: unknown, fail = false): any {
  return {
    DB: {
      prepare: () => ({
        first: async () => {
          if (fail) throw new Error("no table");
          return row;
        }
      })
    }
  };
}

describe("win model registry", () => {
  it("serves every registered model by its own id", () => {
    for (const [id, model] of Object.entries(WIN_MODELS)) expect(model.id).toBe(id);
  });

  it("falls back to the legacy model on unknown ids", () => {
    expect(DEFAULT_WIN_MODEL).toBe("legacy");
    expect(resolveWinModel("unified")).toBe(UNIFIED_WIN_MODEL);
    expect(resolveWinModel("nope")).toBe(LEGACY_WIN_MODEL);
    expect(resolveWinModel(null)).toBe(LEGACY_WIN_MODEL);
    expect(isWinModelId("toString")).toBe(false);
  });

  it("reads the active model from win_model_state and survives a missing table", async () => {
    expect((await loadActiveWinModel(envWith({ active_model: "unified" }))).id).toBe("unified");
    expect((await loadActiveWinModel(envWith(null))).id).toBe("legacy");
    expect((await loadActiveWinModel(envWith(null, true))).id).toBe("legacy");
  });

  it("uses the legacy AGF view when the active one fails", async () => {
    const broken = { ...UNIFIED_WIN_MODEL, loadValues: async () => { throw new Error("boom"); } };
    const legacyEnv: any = {
      DB: { prepare: () => ({ first: async () => ({ status: "paused" }), bind: () => ({ all: async () => ({ results: [] }) }) }) }
    };
    const values = await loadValuesWithFallback(legacyEnv, broken, "2026-10-13", []);
    expect(values.status).toBe("paused");
  });
});

describe("single model coefficients", () => {
  it("only name features the scorer can supply, with finite numbers", () => {
    const known = new Set<string>([...LIVE_COMPONENTS, ...VALUE_MODEL_FEATURES]);
    expect(UNIFIED_SCORE_COEFFICIENTS.anchor).toBe("lp_agf");
    expect(UNIFIED_SCORE_COEFFICIENTS.anchorCoef).toBeGreaterThan(0.5);
    expect(UNIFIED_SCORE_COEFFICIENTS.anchorCoef).toBeLessThan(1.2);
    for (const f of UNIFIED_SCORE_COEFFICIENTS.features) {
      expect(known.has(f.name)).toBe(true);
      for (const x of [f.mean, f.sd, f.coef, f.naCoef]) expect(Number.isFinite(x)).toBe(true);
      expect(f.sd).toBeGreaterThan(0);
    }
    expect(new Set(UNIFIED_SCORE_COEFFICIENTS.features.map(f => f.name)).size).toBe(UNIFIED_SCORE_COEFFICIENTS.features.length);
  });

  it("reads the extra value-model features the legacy score ignores", () => {
    const agf = [40, 30, 20, 10];
    const plain = [{}, {}, {}, {}];
    const heavier = [{}, {}, {}, { wt_chg: 6 }];
    const legacy = learnedWinProbabilities(agf, heavier, SHIPPED_SCORE_COEFFICIENTS)!;
    expect(legacy).toEqual(learnedWinProbabilities(agf, plain, SHIPPED_SCORE_COEFFICIENTS));
    const unified = learnedWinProbabilities(agf, heavier, UNIFIED_SCORE_COEFFICIENTS)!;
    const unifiedPlain = learnedWinProbabilities(agf, plain, UNIFIED_SCORE_COEFFICIENTS)!;
    expect(unified[3]).toBeLessThan(unifiedPlain[3]);
  });

  it("scoreRace prices with the coefficients it is given", () => {
    const runners = [40, 30, 20, 10].map((agf, i) => ({
      horse_number: i + 1, agf_percent: agf, hp: null, weight: null, recent_form_raw: null,
      market_score: null, field_score: null
    })) as any[];
    const features = new Map([[4, { wt_chg: 6 }]]) as any;
    const a = scoreRace(runners, features).map(r => r.modelScore.winProbability);
    const b = scoreRace(runners, features, UNIFIED_SCORE_COEFFICIENTS).map(r => r.modelScore.winProbability);
    expect(a).not.toEqual(b);
    expect(b.reduce((s, p) => s + (p as number), 0)).toBeCloseTo(1, 6);
  });
});

describe("single model AGF view", () => {
  const meeting = {
    city: "İstanbul",
    races: [{
      race_number: 3,
      runners: [
        { horse_number: 1, agf_percent: 40, modelScore: { scoreSource: "learned", winProbability: 0.38 } },
        { horse_number: 2, agf_percent: 30, modelScore: { scoreSource: "learned", winProbability: 0.28 } },
        { horse_number: 3, agf_percent: 15, modelScore: { scoreSource: "learned", winProbability: 0.14 } },
        { horse_number: 4, agf_percent: 10, modelScore: { scoreSource: "learned", winProbability: 0.14 } },
        { horse_number: 5, agf_percent: 5, modelScore: { scoreSource: "learned", winProbability: 0.06 } }
      ]
    }]
  };

  it("labels the card's own chance against the AGF share", () => {
    const view = unifiedValues([meeting], "2026-10-13T12:00:00Z");
    expect(view.status).toBe("active");
    const four = view.byRunner.get("İstanbul|3|4")!;
    expect(four.probability).toBe(0.14);
    expect(four.agfProbability).toBe(0.1);
    expect(four.valueRatio).toBe(1.4);
    expect(four.label).toBe("underrated");
    expect(four.variant).toBe("unified");
    expect(view.byRunner.get("İstanbul|3|1")!.label).toBeNull();
  });

  it("feeds the card's Sürpriz from the same chances", () => {
    const meetings = JSON.parse(JSON.stringify([meeting]));
    attachValues(meetings, unifiedValues(meetings));
    expect(meetings[0].races[0].surpriseNumber).toBe(4);
    expect(valueSurpriseNumber(meetings[0].races[0].runners)).toBe(4);
  });

  it("gives no view for races the learned score did not price", () => {
    const weighted = { city: "Adana", races: [{ race_number: 1, runners: [
      { horse_number: 1, agf_percent: null, modelScore: { scoreSource: "weighted", winProbability: null } },
      { horse_number: 2, agf_percent: null, modelScore: { scoreSource: "no-agf", winProbability: 0.5 } }
    ] }] };
    expect(unifiedValues([weighted]).byRunner.size).toBe(0);
  });
});
