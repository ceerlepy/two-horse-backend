/*
 * Calibrated AGF win probability for foreign (TJK "YD") races.
 *
 * Generated from analysis/yurtdisi-model-2026-10-05/results/b2_coefficients.json
 * (scripts/b2_export.py, 2026-10-05). Model "b2": a race-softmax
 * conditional logit on log normalised AGF with country and field-size
 * interactions, fitted on 19,941 foreign races (2024-01..2026-10).
 * Out of sample (monthly walk-forward, 13,779 races) it beat raw AGF:
 * log-loss 1.7721 -> 1.7631.
 *
 * Raw AGF overstates heavy favourites and understates long shots; the
 * slope below (< 1) flattens it, less so in countries whose AGF pools
 * are already well calibrated (US, CA) and most in France.
 *
 *   q_i      = agf_i / sum_j agf_j
 *   lp_i     = ln(max(q_i, 1e-4))
 *   slope    = betaAgf + betaField * (ln(nField) - fieldCenter) + betaCountry[group]
 *   winProb_i = exp(slope * lp_i) / sum_j exp(slope * lp_j)
 *
 * nField was the number of betting entries (coupled horses = one) in
 * training; the programme carries no coupling, so the number of runners
 * with AGF is used. On 2026-07..10 that changes log-loss by 1e-6.
 */

export type ForeignCountryGroup =
  | "US"
  | "ZA"
  | "GB"
  | "FR"
  | "HK"
  | "IE"
  | "CA"
  | "AU"
  | "other";

export const FOREIGN_WIN_PROB_MODEL = {
  model: "b2_recal_country",
  fittedOn: "2024-01..2026-10",
  betaAgf: 0.648595,
  betaField: -0.009224,
  fieldCenter: 2.2,
  betaCountry: {
    US: 0.273601,
    ZA: 0.21736,
    GB: 0.228737,
    FR: 0.03471,
    HK: 0.139261,
    IE: 0.148396,
    CA: 0.291992,
    AU: 0.139184,
    other: 0
  } as Record<ForeignCountryGroup, number>,
  /* Below this AGF total the pool is too thin to calibrate. */
  minAgfSum: 80,
  minRunnersWithAgf: 2
} as const;


/*
 * TJK names foreign meetings "<Venue> <Country>". Every one of the 162
 * venues in the training data maps to the same group by these suffixes;
 * anything else (Almanya, Dubai, Şili, ...) is "other".
 */
const GROUP_SUFFIXES: Array<[RegExp, ForeignCountryGroup]> = [
  [/(?:^|\s)ABD$/u, "US"],
  [/(?:^|\s)(?:Güney|Guney)\s+Afrika$/iu, "ZA"],
  [/(?:^|\s)(?:Birleşik\s+Krallık|Birlesik\s+Krallik|İngiltere|Ingiltere|Ingıltere)$/iu, "GB"],
  [/(?:^|\s)Fransa$/iu, "FR"],
  [/(?:^|\s)Hong\s+Kong$/iu, "HK"],
  [/(?:^|\s)(?:İrlanda|Irlanda)$/iu, "IE"],
  [/(?:^|\s)Kanada$/iu, "CA"],
  [/(?:^|\s)Avustralya$/iu, "AU"]
];


export function foreignCountryGroup(
  ...names: Array<string | null | undefined>
): ForeignCountryGroup {
  for (const raw of names) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    for (const [re, group] of GROUP_SUFFIXES) {
      if (re.test(name)) return group;
    }
  }
  return "other";
}


/*
 * Per-runner win probability (0..1), same order as the input. Runners
 * without AGF get null; the whole race gets null when fewer than two
 * runners have AGF or the AGF total is under 80%.
 */
export function foreignWinProbs(
  agfPercents: Array<number | null | undefined>,
  group: ForeignCountryGroup
): Array<number | null> {
  const m = FOREIGN_WIN_PROB_MODEL;
  const valid = agfPercents.map(
    a => typeof a === "number" && Number.isFinite(a) && a > 0
  );
  const agf = agfPercents.map((a, i) => (valid[i] ? (a as number) : 0));
  const n = valid.filter(Boolean).length;
  const sum = agf.reduce((s, a) => s + a, 0);

  if (n < m.minRunnersWithAgf || sum < m.minAgfSum) {
    return agfPercents.map(() => null);
  }

  const slope =
    m.betaAgf +
    m.betaField * (Math.log(n) - m.fieldCenter) +
    (m.betaCountry[group] ?? 0);

  const scores = agf.map((a, i) =>
    valid[i] ? slope * Math.log(Math.max(a / sum, 1e-4)) : -Infinity
  );
  const top = Math.max(...scores);
  const exps = scores.map((s, i) => (valid[i] ? Math.exp(s - top) : 0));
  const z = exps.reduce((s, e) => s + e, 0);

  return exps.map((e, i) => (valid[i] ? e / z : null));
}


/* Adds winProb to every runner of a foreign race. */
export function withForeignWinProbs<
  R extends { runners: Array<{ agfPercent: number | null }> }
>(
  race: R,
  group: ForeignCountryGroup
): R & { runners: Array<R["runners"][number] & { winProb: number | null }> } {
  const probs = foreignWinProbs(
    race.runners.map(runner => runner.agfPercent),
    group
  );

  return {
    ...race,
    runners: race.runners.map((runner, i) => ({
      ...runner,
      winProb: probs[i] === null ? null : Math.round((probs[i] as number) * 10000) / 10000
    }))
  };
}
