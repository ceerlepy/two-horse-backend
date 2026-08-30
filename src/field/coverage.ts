/*
 * A field score can be genuinely present for only a minority of a
 * race -- a mixed debut/experienced field, or TJK's performance page
 * failing to resolve some horses -- without any single runner's own
 * score being wrong. The bug this guards against is not a bad score,
 * it's an unfair *comparison*: letting only the covered subset carry
 * a field score into scoring would let running-style shape their
 * finishing-position estimate while their closest rivals in the same
 * race are judged without it, an edge that has nothing to do with
 * who is actually the better horse. Race-level coverage decides
 * whether the signal is trustworthy enough to use for anyone in that
 * race, not whether any one runner's number looks plausible.
 */
export type FieldCoverageState =
  | "no-data"
  | "partial-data"
  | "full-data";

export const FIELD_COVERAGE_THRESHOLD = 0.5;

export function classifyFieldCoverage(
  totalRunners: number,
  coveredRunners: number
): FieldCoverageState {
  if (totalRunners <= 0 || coveredRunners <= 0) {
    return "no-data";
  }

  if (coveredRunners / totalRunners < FIELD_COVERAGE_THRESHOLD) {
    return "partial-data";
  }

  return "full-data";
}

export interface RaceFieldSignalCoverageRow {
  city: string;
  raceNumber: number;
  totalRunners: number;
  coveredRunners: number;
  coverageState: FieldCoverageState;
}

/*
 * Diagnostics-facing view of the same coverage decision suppressPartial-
 * FieldCoverage makes at scoring time, built from a raw per-race TJK
 * field_signals join so an operator can see *why* a race scored
 * without field signal instead of just that it did.
 */
export function buildRaceFieldSignalCoverage(
  rows: Array<{
    city: unknown;
    race_number: unknown;
    total_runners: unknown;
    covered_runners: unknown;
  }>
): RaceFieldSignalCoverageRow[] {
  return rows.map(row => {
    const totalRunners =
      Number(row.total_runners ?? 0);

    const coveredRunners =
      Number(row.covered_runners ?? 0);

    return {
      city: String(row.city ?? ""),
      raceNumber: Number(row.race_number ?? 0),
      totalRunners,
      coveredRunners,

      coverageState:
        classifyFieldCoverage(
          totalRunners,
          coveredRunners
        )
    };
  });
}

interface FieldScopedRunner {
  field_score: number | null;
  fieldSignal?: {
    score: number | null;
    [key: string]: unknown;
  };
}

export interface SuppressedFieldCoverage<T> {
  runners: T[];
  coverageState: FieldCoverageState;
}

/*
 * Below threshold, every runner in the race loses field_score --
 * including the ones that individually had a value -- because the
 * point is race-wide comparability, not any single runner's data
 * quality. tjkScore/expertScore stay on fieldSignal for diagnostics;
 * only the score actually fed into scoring is nulled.
 */
export function suppressPartialFieldCoverage<
  T extends FieldScopedRunner
>(runners: T[]): SuppressedFieldCoverage<T> {
  const coveredRunners =
    runners.filter(runner => runner.field_score != null).length;

  const coverageState =
    classifyFieldCoverage(runners.length, coveredRunners);

  if (coverageState === "full-data") {
    return {
      runners: runners.map(runner => ({
        ...runner,

        fieldSignal: runner.fieldSignal
          ? { ...runner.fieldSignal, coverageState }
          : runner.fieldSignal
      })),

      coverageState
    };
  }

  return {
    runners: runners.map(runner => ({
      ...runner,
      field_score: null,

      fieldSignal: runner.fieldSignal
        ? { ...runner.fieldSignal, score: null, coverageState }
        : runner.fieldSignal
    })),

    coverageState
  };
}
