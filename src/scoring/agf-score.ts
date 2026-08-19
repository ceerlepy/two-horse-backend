import {
  clamp,
  finiteOrNull
} from "./math";

/*
 * AGF is already a market percentage.
 *
 * We keep it interpretable rather than
 * introducing an arbitrary nonlinear transform.
 */
export function scoreAgf(
  agfPercent: unknown
): number | null {
  const value =
    finiteOrNull(
      agfPercent
    );

  if (value === null) {
    return null;
  }

  return clamp(
    value,
    0,
    100
  );
}
