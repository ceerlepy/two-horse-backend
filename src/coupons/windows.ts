export interface SixFoldWindow {
  sixfold: number;
  startRace: number;
  endRace: number;
  raceNumbers: number[];

  source:
    | "tjk-program"
    | "canonical-program";
}


export interface ExplicitSixFoldStart {
  sixfold: number;
  startRace: number;
}


function windowFromStart(
  ordered:
    number[],
  sixfold:
    number,
  startRace:
    number,
  source:
    SixFoldWindow["source"]
): SixFoldWindow | null {
  const index =
    ordered.indexOf(
      startRace
    );

  if (index < 0) {
    return null;
  }

  const raceNumbers =
    ordered.slice(
      index,
      index + 6
    );

  if (
    raceNumbers.length !== 6
  ) {
    return null;
  }

  return {
    sixfold,
    startRace:
      raceNumbers[0],
    endRace:
      raceNumbers[5],
    raceNumbers,
    source
  };
}


/*
 * Prefer official TJK start markers.
 *
 * Only fall back to card-derived windows for a
 * six-fold number whose explicit marker was not
 * available or could not form six consecutive races.
 */
export function resolveSixFoldWindows(
  raceNumbers:
    number[],
  explicitStarts:
    ExplicitSixFoldStart[] = []
): SixFoldWindow[] {
  const ordered =
    [...new Set(
      raceNumbers
        .map(Number)
        .filter(
          Number.isFinite
        )
    )]
      .sort(
        (a, b) =>
          a - b
      );

  if (
    ordered.length < 6
  ) {
    return [];
  }

  const result =
    new Map<
      number,
      SixFoldWindow
    >();

  for (
    const explicit of
    explicitStarts
  ) {
    if (
      explicit.sixfold !== 1 &&
      explicit.sixfold !== 2
    ) {
      continue;
    }

    const window =
      windowFromStart(
        ordered,
        explicit.sixfold,
        explicit.startRace,
        "tjk-program"
      );

    if (window) {
      result.set(
        explicit.sixfold,
        window
      );
    }
  }

  if (
    !result.has(1)
  ) {
    const first =
      windowFromStart(
        ordered,
        1,
        ordered[0],
        "canonical-program"
      );

    if (first) {
      result.set(
        1,
        first
      );
    }
  }

  if (
    ordered.length > 6 &&
    !result.has(2)
  ) {
    const fallbackStart =
      ordered[
        ordered.length - 6
      ];

    const second =
      windowFromStart(
        ordered,
        2,
        fallbackStart,
        "canonical-program"
      );

    if (second) {
      result.set(
        2,
        second
      );
    }
  }

  return [...result.values()]
    .sort(
      (a, b) =>
        a.sixfold -
        b.sixfold
    );
}
