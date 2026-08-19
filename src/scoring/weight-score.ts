import {
  clamp,
  finiteOrNull
} from "./math";

/*
 * Lower carried weight is a modest positive,
 * but this signal must never dominate.
 *
 * Score is race-relative and capped.
 */
export function scoreWeight(
  weight: unknown,
  raceWeights: unknown[]
): number | null {
  const value =
    finiteOrNull(weight);

  if (value === null) {
    return null;
  }

  const values =
    raceWeights
      .map(finiteOrNull)
      .filter(
        (x): x is number =>
          x !== null
      );

  if (!values.length) {
    return null;
  }

  const minimum =
    Math.min(...values);

  const maximum =
    Math.max(...values);

  if (maximum <= minimum) {
    return 50;
  }

  /*
   * inverse min-max:
   * lowest carried weight -> 100
   * highest -> 0
   */
  return clamp(
    (
      (maximum - value) /
      (maximum - minimum)
    ) * 100,
    0,
    100
  );
}
