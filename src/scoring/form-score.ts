import {
  clamp
} from "./math";

export function scoreForm(
  formScore:
    number | null | undefined
): number | null {
  if (
    formScore === null ||
    formScore === undefined ||
    !Number.isFinite(
      formScore
    )
  ) {
    return null;
  }

  return clamp(
    formScore,
    0,
    100
  );
}
