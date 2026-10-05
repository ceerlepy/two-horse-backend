import constants from "./data/constants.json";

/*
 * Pre-race features for the value model. Every input is dated strictly
 * before the race date, so the same code produces training rows and live
 * predictions. Definitions mirror the offline measurement of 2026-10-04
 * (scripts in /mnt/project-files/analysis/agf-deger-olcumu-2026-10-04).
 */

export const VALUE_MODEL_FEATURES = [
  "fig_best3_rel", "fig_last_rel", "n_prev", "jockey_ae", "jockey_upg", "horse_ae",
  "days_off", "dist_chg", "surf_chg", "wt_chg",
  "idm_best400_z30_rel", "idm_best800_z30_rel", "idm_last_z_rel", "idm_n30", "idm_days_last",
  "agf_gny_ratio"
] as const;

export type FeatureName = typeof VALUE_MODEL_FEATURES[number];
export type FeatureVector = Record<FeatureName, number | null>;

export interface PastRun {
  raceDate: string;            // YYYY-MM-DD
  fig: number | null;
  won: boolean;
  pWin: number | null;
  distanceMeters: number | null;
  surface: string | null;
  jockeyId: number | null;
  weight: number | null;
}

export interface JockeyWindow {
  rides: number;
  wins: number;
  expectedWins: number;
}

export interface Gallop {
  date: string;                // YYYY-MM-DD
  hippodrome: string;
  surface: string;
  effort: string;
  kind?: string;
  splits: Record<string, number>; // metres -> seconds
}

export interface FeatureRunner {
  horseNumber: number;
  horseId: number | null;
  jockeyId: number | null;
  weight: number | null;
  agfPercent: number | null;
  odds: number | null;
}

export interface FeatureContext {
  raceDate: string;
  distanceMeters: number | null;
  surface: string | null;
  history: Map<number, PastRun[]>;           // horseId -> runs, oldest first
  jockeys: Map<number, JockeyWindow>;        // jockeyId -> last 365 days
  gallops: Map<number, Gallop[]> | null;     // horseId -> gallops (null: not fetched)
}

const NORMS: Record<string, [number, number]> = constants.gallopNorms as any;
const DAY_MS = 86_400_000;

function days(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

function jockeyRates(w: JockeyWindow | undefined): { sr: number; ae: number } {
  const rides = w?.rides ?? 0, wins = w?.wins ?? 0, expected = w?.expectedWins ?? 0;
  return {
    sr: (wins + 0.10 * 20) / (rides + 20),
    ae: rides ? (wins + 2) / (expected + 2) : 1.0
  };
}

export function gallopZ(g: Gallop, metres: number): number | null {
  const seconds = g.splits[String(metres)];
  const norm = NORMS[`${g.hippodrome}|${g.surface}|${metres}|${g.effort || "?"}`];
  if (seconds == null || !norm) return null;
  return -(seconds - norm[0]) / norm[1];
}

function maxOrNull(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
}

function relativeToField(values: Array<number | null>): Array<number | null> {
  const present = values.filter((x): x is number => x != null);
  if (!present.length) return values.map(() => null);
  const mean = present.reduce((s, x) => s + x, 0) / present.length;
  return values.map(x => (x == null ? null : x - mean));
}

export function marketProbabilities(runners: FeatureRunner[]): {
  pAgf: Array<number | null>;
  pGanyan: Array<number | null>;
} {
  const agfTotal = runners.reduce((s, r) => s + (r.agfPercent || 0), 0);
  const inverse = runners.map(r => (r.odds && r.odds > 0 ? 1 / r.odds : null));
  const allOdds = inverse.every(v => v != null);
  const oddsTotal = inverse.reduce<number>((s, v) => s + (v ?? 0), 0);
  return {
    pAgf: runners.map(r => (r.agfPercent && agfTotal > 0 ? r.agfPercent / agfTotal : null)),
    pGanyan: inverse.map(v => (allOdds && oddsTotal > 0 ? (v as number) / oddsTotal : null))
  };
}

export function computeFeatures(ctx: FeatureContext, runners: FeatureRunner[]): FeatureVector[] {
  const { pAgf, pGanyan } = marketProbabilities(runners);

  const raw = runners.map(r => {
    const h = (r.horseId != null ? ctx.history.get(r.horseId) : undefined) ?? [];
    const last = h.length ? h[h.length - 1] : null;
    const last3 = h.slice(-3).map(x => x.fig);

    const today = r.jockeyId != null ? jockeyRates(ctx.jockeys.get(r.jockeyId)) : null;
    let lastJockeySr = today?.sr ?? null;
    if (last && last.jockeyId != null && last.jockeyId !== r.jockeyId) {
      lastJockeySr = jockeyRates(ctx.jockeys.get(last.jockeyId)).sr;
    }

    const horseWins = h.filter(x => x.won).length;
    const horseExpected = h.reduce((s, x) => s + (x.pWin ?? 0), 0);

    const gallops = ctx.gallops && r.horseId != null ? ctx.gallops.get(r.horseId) : undefined;
    const prev = gallops ? gallops.filter(g => g.date < ctx.raceDate) : null;
    const lastGallop = prev && prev.length ? prev[prev.length - 1] : null;
    const w30 = prev ? prev.filter(g => days(g.date, ctx.raceDate) <= 30) : [];

    return {
      fig_best3: maxOrNull(last3),
      fig_last: last ? last.fig : null,
      n_prev: h.length,
      jockey_ae: today ? today.ae : null,
      jockey_upg: today && lastJockeySr != null && last ? today.sr - lastJockeySr : null,
      horse_ae: h.length ? (horseWins + 1) / (horseExpected + 1) : null,
      days_off: last ? days(last.raceDate, ctx.raceDate) : null,
      dist_chg: last && ctx.distanceMeters && last.distanceMeters ? ctx.distanceMeters - last.distanceMeters : null,
      surf_chg: last ? (ctx.surface !== last.surface ? 1 : 0) : null,
      wt_chg: last && r.weight && last.weight ? r.weight - last.weight : null,
      idm_last_z: lastGallop ? maxOrNull([400, 600, 800].map(m => gallopZ(lastGallop, m))) : null,
      idm_best400_z30: maxOrNull(w30.map(g => gallopZ(g, 400))),
      idm_best800_z30: maxOrNull(w30.map(g => gallopZ(g, 800))),
      idm_n30: prev ? w30.length : null,
      idm_days_last: lastGallop ? days(lastGallop.date, ctx.raceDate) : null
    };
  });

  const rel = (key: "fig_best3" | "fig_last" | "idm_last_z" | "idm_best400_z30" | "idm_best800_z30") =>
    relativeToField(raw.map(x => x[key]));
  const figBest3Rel = rel("fig_best3"), figLastRel = rel("fig_last");
  const idmLastRel = rel("idm_last_z"), idm400Rel = rel("idm_best400_z30"), idm800Rel = rel("idm_best800_z30");

  return raw.map((x, i) => ({
    fig_best3_rel: figBest3Rel[i],
    fig_last_rel: figLastRel[i],
    n_prev: x.n_prev,
    jockey_ae: x.jockey_ae,
    jockey_upg: x.jockey_upg,
    horse_ae: x.horse_ae,
    days_off: x.days_off,
    dist_chg: x.dist_chg,
    surf_chg: x.surf_chg,
    wt_chg: x.wt_chg,
    idm_best400_z30_rel: idm400Rel[i],
    idm_best800_z30_rel: idm800Rel[i],
    idm_last_z_rel: idmLastRel[i],
    idm_n30: x.idm_n30,
    idm_days_last: x.idm_days_last,
    agf_gny_ratio: pAgf[i] != null && pGanyan[i] != null ? Math.log((pGanyan[i] as number) / (pAgf[i] as number)) : null
  }));
}
