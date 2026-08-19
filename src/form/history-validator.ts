import type {
  HorseHistoryRun
} from "./types";

export function validateHorseHistory(
  rows: HorseHistoryRun[]
): void {
  if (!Array.isArray(rows)) {
    throw new Error(
      "FORM_NOT_ARRAY"
    );
  }

  if (!rows.length) {
    throw new Error(
      "FORM_NO_ROWS"
    );
  }

  const usable =
    rows.filter(
      row =>
        /^\d{4}-\d{2}-\d{2}$/.test(
          row.raceDate
        ) &&
        row.finishPosition !== null &&
        row.finishPosition > 0
    );

  if (!usable.length) {
    throw new Error(
      "FORM_NO_USABLE_ROWS"
    );
  }

  /*
   * Defensive upper bound:
   * malformed navigation tables must never
   * masquerade as horse history.
   */
  if (rows.length > 500) {
    throw new Error(
      `FORM_IMPLAUSIBLE_ROW_COUNT:${rows.length}`
    );
  }
}
