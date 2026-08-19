export function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

export function round(
  value: number,
  digits = 2
): number {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

export function finiteOrNull(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function minMaxScore(
  value: number,
  minimum: number,
  maximum: number
): number {
  if (maximum <= minimum) {
    return 50;
  }

  return clamp(
    (
      (value - minimum) /
      (maximum - minimum)
    ) * 100,
    0,
    100
  );
}
