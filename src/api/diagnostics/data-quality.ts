/*
 * Missing recent_form_raw/hp is not automatically a parser bug: a
 * debut horse genuinely has no prior form string and no TJK
 * handicap rating yet, and that always shows up as *every* runner
 * in that specific race missing the field together, never a
 * scattered subset. A real extraction failure looks different: some
 * runners in a race have the field and others don't, with no
 * shared reason. Classifying per race lets diagnostics alarm on the
 * second case without crying wolf over the first.
 */
export type RaceFieldCoverage =
  | "full-coverage"
  | "likely-not-published"
  | "partial-gap";

export function classifyRaceFieldCoverage(
  totalRunners: number,
  missingCount: number
): RaceFieldCoverage {
  if (missingCount <= 0) {
    return "full-coverage";
  }

  if (missingCount >= totalRunners) {
    return "likely-not-published";
  }

  return "partial-gap";
}

export interface RaceFieldCoverageRow {
  city: string;
  raceNumber: number;
  totalRunners: number;
  missingForm: number;
  missingHp: number;
  unexplainedMissingHp: number;
  formCoverage: RaceFieldCoverage;
  hpCoverage: RaceFieldCoverage;
}

export function buildRaceFieldCoverage(
  rows: Array<{
    city: unknown;
    race_number: unknown;
    total_runners: unknown;
    missing_form: unknown;
    missing_hp: unknown;
    unexplained_missing_hp: unknown;
  }>
): RaceFieldCoverageRow[] {
  return rows.map(row => {
    const totalRunners =
      Number(row.total_runners ?? 0);

    const missingForm =
      Number(row.missing_form ?? 0);

    const missingHp =
      Number(row.missing_hp ?? 0);

    /*
     * TJK does not assign a handicap rating until a horse has run
     * enough races — a runner with only one or two prior starts
     * (a short recent_form_raw) legitimately has no HP yet, same
     * as a full debut field. Only count a missing HP as suspicious
     * when the runner's own form string shows real race history.
     */
    const unexplainedMissingHp =
      Number(
        row.unexplained_missing_hp ??
          missingHp
      );

    return {
      city:
        String(row.city ?? ""),

      raceNumber:
        Number(row.race_number ?? 0),

      totalRunners,
      missingForm,
      missingHp,
      unexplainedMissingHp,

      formCoverage:
        classifyRaceFieldCoverage(
          totalRunners,
          missingForm
        ),

      /*
       * Classified on the raw count so a whole debut field still
       * reads as "likely-not-published" (informative, not alarmed).
       * unexplainedMissingHp above is the actual alarm signal a
       * caller should gate on, since it survives the debut/
       * short-history explanations that a plain count can't tell
       * apart from a real gap.
       */
      hpCoverage:
        classifyRaceFieldCoverage(
          totalRunners,
          missingHp
        )
    };
  });
}
