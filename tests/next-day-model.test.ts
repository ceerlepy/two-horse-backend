import { describe, expect, it } from "vitest";
import { nextDayProbabilities, nextDayUtilities } from "../src/value-model/next-day-model";
import { scoreNextDayRace } from "../src/experts/next-day-service";
import type { FeatureVector } from "../src/value-model/features";

const blank = (over: Partial<FeatureVector> = {}): FeatureVector => ({
  fig_best3_rel: 0, fig_last_rel: 0, n_prev: 10, jockey_ae: 1, jockey_upg: 0, horse_ae: 1,
  days_off: 20, dist_chg: 0, surf_chg: 0, wt_chg: 0,
  idm_best400_z30_rel: 0, idm_best800_z30_rel: 0, idm_last_z_rel: 0, idm_n30: 4, idm_days_last: 5,
  agf_gny_ratio: null, draw_ae_rel: 0, spec_best_rel: 0, ...over
});

describe("tomorrow's model", () => {
  it("rates a faster, higher-rated horse above an equal field", () => {
    const u = nextDayUtilities(
      [blank({ fig_best3_rel: 20, spec_best_rel: 15 }), blank(), blank()],
      [{ hp: 60, weight: 58, lastFinish: 1 }, { hp: 40, weight: 58, lastFinish: 6 }, { hp: 40, weight: 58, lastFinish: 6 }]
    );
    expect(u[0]).toBeGreaterThan(u[1]);
    expect(u[1]).toBeCloseTo(u[2]);
  });

  it("turns utilities into probabilities with a small expert nudge", () => {
    const p = nextDayProbabilities([0, 0], [80, 60]);
    expect(p[0] + p[1]).toBeCloseTo(1);
    expect(p[0]).toBeGreaterThan(p[1]);
    expect(p[0]).toBeLessThan(0.65);
    expect(nextDayProbabilities([0, 0], [null, null])).toEqual([0.5, 0.5]);
  });

  it("replaces the weighted score only when every runner has a utility", () => {
    const runners = [1, 2, 3].map(n => ({
      horse_number: n, horse_name: `H${n}`, jockey: null, weight: 58, hp: 50,
      recent_form_raw: "111", start_position: n
    }));
    const noExperts = () => ({ sourceCount: 0 } as any);
    const full = scoreNextDayRace(runners, noExperts, new Map([[1, 1], [2, 0], [3, 0]]));
    expect(full.get(1)!.score).toBeGreaterThan(full.get(2)!.score);
    const partial = scoreNextDayRace(runners, noExperts, new Map([[1, 1], [2, 0]]));
    expect(partial.get(1)!.score).toBe(partial.get(2)!.score);
  });
});
