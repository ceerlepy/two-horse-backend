export const SCORING_WEIGHTS = {
  agf: 25,
  expert: 22,
  form: 18,
  hp: 15,
  market: 10,
  weight: 5,
  field: 5
} as const;

export const TOTAL_SCORING_WEIGHT =
  Object.values(
    SCORING_WEIGHTS
  ).reduce(
    (sum, value) =>
      sum + value,
    0
  );
