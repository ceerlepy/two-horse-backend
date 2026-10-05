/*
 * /api/today was ~827KB, almost all of it per-runner fields the
 * Android app never reads: raw D1 bookkeeping columns repeated on
 * every runner (race_date, city, race_number, updated_at, profile
 * URLs, ids), the expert aggregator's internal weighted* sums,
 * modelScore's availableWeight/configuredWeight totals, the
 * market_score/field_score copies of marketMovement.score and
 * fieldSignal.score, and 15+ digit floats.
 *
 * This projection keeps exactly what the app's parser reads
 * (TwoHorseApi.kt parseRace/parseHorse) and rounds floats to 4
 * decimals, far below anything the UI displays. Nothing the app
 * shows changes. `?view=full` still returns the untrimmed public
 * shape for diagnostics; the coupon generator and learning
 * pipeline read getToday() directly and never see this.
 */

const FLOAT_DECIMALS = 4;

function round(
  value: unknown
): unknown {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Number.isInteger(value)
  ) {
    return value;
  }

  const factor =
    10 ** FLOAT_DECIMALS;

  return Math.round(
    value * factor
  ) / factor;
}

function pick(
  source: any,
  keys: readonly string[]
): Record<string, unknown> | undefined {
  if (
    source == null ||
    typeof source !== "object"
  ) {
    return undefined;
  }

  const out: Record<string, unknown> = {};

  for (const key of keys) {
    const value =
      source[key];

    if (value === undefined) {
      continue;
    }

    out[key] =
      Array.isArray(value)
        ? value.map(round)
        : round(value);
  }

  return out;
}

const RACE_KEYS = [
  "race_date",
  "city",
  "race_number",
  "start_time",
  "starts_at",
  "distance_meters",
  "track",
  "finalized_at"
] as const;

const RUNNER_KEYS = [
  "horse_number",
  "horse_name",
  "jockey",
  "weight",
  "hp",
  "agf_percent",
  "recent_form_raw",
  "finish_position"
] as const;

const MODEL_SCORE_KEYS = [
  "score",
  "confidence",
  "baseScore",
  "learningAdjustment"
] as const;

const SCORE_COMPONENT_KEYS = [
  "key",
  "score",
  "configuredWeight",
  "effectiveWeight"
] as const;

const EXPERT_CONSENSUS_KEYS = [
  "sourceCount",
  "bankoCount",
  "favoriteCount",
  "strongCount",
  "starCount",
  "rivalCount",
  "surpriseCount",
  "avoidCount",
  "bankoScore",
  "favoriteScore",
  "strongScore",
  "starScore",
  "rivalScore",
  "surpriseScore",
  "avoidScore",
  "expertScore",
  "supportConfidence",
  "labels",
  "summary"
] as const;

const MARKET_MOVEMENT_KEYS = [
  "score",
  "sampleSize",
  "firstAgf",
  "latestAgf",
  "absoluteDelta",
  "relativeDelta",
  "spanMinutes",
  "direction"
] as const;

const FIELD_SIGNAL_KEYS = [
  "score",
  "tjkScore",
  "expertScore",
  "tjkSampleSize"
] as const;

const VALUE_MODEL_KEYS = [
  "probability",
  "agfProbability",
  "ganyanProbability",
  "odds",
  "valueRatio",
  "label",
  "variant"
] as const;

const UNCERTAINTY_KEYS = [
  "level",
  "score",
  "topMargin",
  "leaderScore",
  "secondScore",
  "expansionPressure"
] as const;

const COUPON_STRATEGY_KEYS = [
  "mode",
  "horseNumbers",
  "confidence",
  "expansionPressure",
  "reason"
] as const;

function assign(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function toCompactRunner(
  runner: any
): Record<string, unknown> {
  const out =
    pick(
      runner,
      RUNNER_KEYS
    ) ?? {};

  const modelScore =
    pick(
      runner?.modelScore,
      MODEL_SCORE_KEYS
    );

  if (
    modelScore &&
    Array.isArray(
      runner.modelScore.components
    )
  ) {
    modelScore.components =
      runner.modelScore.components.map(
        (component: any) =>
          pick(
            component,
            SCORE_COMPONENT_KEYS
          )
      );
  }

  assign(out, "modelScore", modelScore);

  assign(
    out,
    "expertConsensus",
    pick(
      runner?.expertConsensus,
      EXPERT_CONSENSUS_KEYS
    )
  );

  assign(
    out,
    "marketMovement",
    pick(
      runner?.marketMovement,
      MARKET_MOVEMENT_KEYS
    )
  );

  assign(
    out,
    "fieldSignal",
    pick(
      runner?.fieldSignal,
      FIELD_SIGNAL_KEYS
    )
  );

  assign(
    out,
    "valueModel",
    pick(
      runner?.valueModel,
      VALUE_MODEL_KEYS
    )
  );

  return out;
}

export function toCompactRace(
  race: any
): Record<string, unknown> {
  const out =
    pick(
      race,
      RACE_KEYS
    ) ?? {};

  assign(
    out,
    "uncertainty",
    pick(
      race?.uncertainty,
      UNCERTAINTY_KEYS
    )
  );

  assign(
    out,
    "couponStrategy",
    pick(
      race?.couponStrategy,
      COUPON_STRATEGY_KEYS
    )
  );

  assign(
    out,
    "valueModelStatus",
    race?.valueModelStatus
  );

  out.runners =
    (race?.runners ?? []).map(
      toCompactRunner
    );

  return out;
}

export function toCompactMeetings(
  meetings: any[]
): any[] {
  return meetings.map(
    ({ races, ...meeting }) => ({
      ...meeting,

      races:
        (races ?? []).map(
          toCompactRace
        )
    })
  );
}
