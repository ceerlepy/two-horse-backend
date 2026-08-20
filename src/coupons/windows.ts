export interface SixFoldWindow {
  sixfold: number;
  startRace: number;
  endRace: number;
  raceNumbers: number[];
}


/*
 * Canonical card-level six-fold windows.
 *
 * We derive the playable six-race windows from the
 * actual canonical TJK race numbers, not array offsets.
 *
 * For an 8-race card:
 * 1st six-fold = 1..6
 * 2nd six-fold = 3..8
 */
export function resolveSixFoldWindows(
  raceNumbers:
    number[]
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

  const first =
    ordered.slice(
      0,
      6
    );

  const windows:
    SixFoldWindow[] = [
      {
        sixfold: 1,
        startRace:
          first[0],
        endRace:
          first[5],
        raceNumbers:
          first
      }
    ];

  if (
    ordered.length > 6
  ) {
    const second =
      ordered.slice(
        ordered.length - 6
      );

    windows.push({
      sixfold: 2,
      startRace:
        second[0],
      endRace:
        second[5],
      raceNumbers:
        second
    });
  }

  return windows;
}
