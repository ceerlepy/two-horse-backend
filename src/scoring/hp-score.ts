import {
  finiteOrNull,
  minMaxScore
} from "./math";

export function scoreHp(
  hp: unknown,
  raceHpValues: unknown[]
): number | null {
  const value =
    finiteOrNull(hp);

  if (value === null) {
    return null;
  }

  const values =
    raceHpValues
      .map(finiteOrNull)
      .filter(
        (x): x is number =>
          x !== null
      );

  if (!values.length) {
    return null;
  }

  return minMaxScore(
    value,
    Math.min(...values),
    Math.max(...values)
  );
}
