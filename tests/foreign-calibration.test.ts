import {
  describe,
  expect,
  it
} from "vitest";

import {
  FOREIGN_WIN_PROB_MODEL,
  foreignCountryGroup,
  foreignWinProbs,
  withForeignWinProbs
} from "../src/foreign/calibration";

import {
  getForeignMeetings
} from "../src/foreign/service";

import {
  TIER_LIMITS
} from "../src/membership/tier";

import {
  createSqliteD1
} from "./helpers/sqlite-d1";


const sum = (values: Array<number | null>) =>
  values.reduce<number>((s, v) => s + (v ?? 0), 0);


describe("foreignWinProbs", () => {
  it("sums to 1 over the runners with AGF", () => {
    const probs = foreignWinProbs([42, 21, 12, 9, 7, 5, 4], "US");
    expect(sum(probs)).toBeCloseTo(1, 9);
    probs.forEach(p => expect(p).toBeGreaterThan(0));
  });

  it("keeps AGF order (monotonic in AGF)", () => {
    const agf = [3, 30, 11, 18, 2, 25, 11];
    for (const group of ["US", "FR", "other"] as const) {
      const probs = foreignWinProbs(agf, group) as number[];
      for (let i = 0; i < agf.length; i++) {
        for (let j = 0; j < agf.length; j++) {
          if (agf[i] > agf[j]) expect(probs[i]).toBeGreaterThan(probs[j]);
          if (agf[i] === agf[j]) expect(probs[i]).toBeCloseTo(probs[j], 12);
        }
      }
    }
  });

  it("flattens AGF: favourite down, long shot up", () => {
    const probs = foreignWinProbs([61, 20, 10, 6, 3], "GB") as number[];
    expect(probs[0]).toBeLessThan(0.61);
    expect(probs[4]).toBeGreaterThan(0.03);
  });

  it("matches the exported b2 formula (hand-computed, France, 5 runners)", () => {
    const agf = [40, 30, 15, 10, 5];
    const m = FOREIGN_WIN_PROB_MODEL;
    const slope = m.betaAgf + m.betaField * (Math.log(5) - m.fieldCenter) + m.betaCountry.FR;
    const e = agf.map(a => Math.exp(slope * Math.log(a / 100)));
    const z = e.reduce((s, v) => s + v, 0);
    const probs = foreignWinProbs(agf, "FR") as number[];
    probs.forEach((p, i) => expect(p).toBeCloseTo(e[i] / z, 12));
  });

  it("matches the Python reference from b2_export.py (US, 7 runners)", () => {
    const expected = [0.395898, 0.208578, 0.124329, 0.095293, 0.075536, 0.055341, 0.045025];
    const probs = foreignWinProbs([42, 21, 12, 9, 7, 5, 4], "US") as number[];
    probs.forEach((p, i) => expect(p).toBeCloseTo(expected[i], 6));
  });

  it("gives null to runners without AGF and renormalises over the rest", () => {
    const probs = foreignWinProbs([50, null, 30, 0, 20], "ZA");
    expect(probs[1]).toBeNull();
    expect(probs[3]).toBeNull();
    expect(sum(probs)).toBeCloseTo(1, 9);
  });

  it("returns null for all when fewer than 2 runners have AGF", () => {
    expect(foreignWinProbs([100, null, null], "US")).toEqual([null, null, null]);
    expect(foreignWinProbs([], "US")).toEqual([]);
  });

  it("returns null for all when the AGF total is under 80", () => {
    expect(foreignWinProbs([40, 30, 9], "US")).toEqual([null, null, null]);
    expect(foreignWinProbs([40, 30, 10], "US").every(p => p !== null)).toBe(true);
  });
});


describe("foreignCountryGroup", () => {
  it("maps TJK venue names to the model's country groups", () => {
    expect(foreignCountryGroup("Santa Anita Park ABD")).toBe("US");
    expect(foreignCountryGroup("Durbanville Guney Afrika")).toBe("ZA");
    expect(foreignCountryGroup("Lingfield Birleşik Krallık")).toBe("GB");
    expect(foreignCountryGroup("Newmarket Ingiltere")).toBe("GB");
    expect(foreignCountryGroup("Longchamp Fransa")).toBe("FR");
    expect(foreignCountryGroup("Sha Tin Hong Kong")).toBe("HK");
    expect(foreignCountryGroup("Dundalk İrlanda")).toBe("IE");
    expect(foreignCountryGroup("Woodbine Kanada")).toBe("CA");
    expect(foreignCountryGroup("York Avustralya")).toBe("AU");
    expect(foreignCountryGroup("Meydan Dubai")).toBe("other");
    expect(foreignCountryGroup("Baden-Baden Almanya")).toBe("other");
  });

  it("falls back to the meeting's country", () => {
    expect(foreignCountryGroup("Somewhere", "Fransa")).toBe("FR");
    expect(foreignCountryGroup(null, null)).toBe("other");
  });
});


describe("withForeignWinProbs", () => {
  it("adds a rounded winProb to every runner", () => {
    const race = withForeignWinProbs(
      { raceNumber: 1, runners: [{ agfPercent: 60 }, { agfPercent: 40 }, { agfPercent: null }] },
      "US"
    );
    expect(race.runners[2].winProb).toBeNull();
    expect(race.runners[0].winProb! + race.runners[1].winProb!).toBeCloseTo(1, 3);
  });
});


describe("/api/foreign winProb tier gate", () => {
  async function envWithMeeting(): Promise<any> {
    const env: any = { DB: createSqliteD1(["migrations/0034_foreign_meetings.sql"]) };
    await env.DB.prepare(
      "CREATE TABLE foreign_expert_pages (race_date TEXT, city TEXT, source_key TEXT, picks_json TEXT)"
    ).run();
    const races = [{
      raceNumber: 1, time: "20:05", distanceMeters: 1600, track: "Çim",
      runners: [
        { number: 1, name: "A", jockey: null, weight: null, agfPercent: 50, recentForm: null },
        { number: 2, name: "B", jockey: null, weight: null, agfPercent: 30, recentForm: null },
        { number: 3, name: "C", jockey: null, weight: null, agfPercent: 20, recentForm: null }
      ]
    }];
    await env.DB.prepare(
      "INSERT INTO foreign_meetings VALUES (?,?,?,?,?,?,?)"
    ).bind("2026-10-05", "Longchamp Fransa", "Fransa", 3, JSON.stringify(races), "https://x", "2026-10-05T10:00:00Z").run();
    return env;
  }

  it("is only sent to tiers that see model signals (Gold+)", async () => {
    const env = await envWithMeeting();

    for (const tier of ["free", "gold", "premium"] as const) {
      const meetings = await getForeignMeetings(env, "2026-10-05", TIER_LIMITS[tier].canViewFullSignals);
      const runners = meetings[0].races[0].runners;

      if (tier === "free") {
        runners.forEach(r => expect(r).not.toHaveProperty("winProb"));
      } else {
        expect(sum(runners.map(r => r.winProb ?? null))).toBeCloseTo(1, 3);
        expect(runners[0].winProb!).toBeLessThan(0.5);
      }
    }

    expect(TIER_LIMITS.free.canViewFullSignals).toBe(false);
    expect(TIER_LIMITS.gold.canViewFullSignals).toBe(true);
  });
});
