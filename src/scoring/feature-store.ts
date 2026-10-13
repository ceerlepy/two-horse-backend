import type { Env } from "../env";
import { VALUE_MODEL_FEATURES } from "../value-model/features";
import type {
  LearnedFeatureName,
  LearnedFeatures
} from "./learned-score";
import type { RaceLearnedFeatures } from "./race-score";

/*
 * The learned score needs signals AGF does not price (adjusted speed
 * figure, same-trip specialist figure, gallop tempo, draw bias, the
 * AGF/ganyan disagreement, jockey record, layoff, weight change...). The
 * value model already computes and stores them per runner, so they are read
 * from its feature store rather than computed a second time. All of them are
 * loaded; each score model's coefficients decide which ones it uses. Nothing
 * here writes to it.
 *
 * A race with no stored row simply scores without them: the model carries a
 * missing-value coefficient for every feature.
 */

export type ProgramLearnedFeatures =
  Map<string, RaceLearnedFeatures>;

export function raceFeatureKey(
  city: string,
  raceNumber: number
): string {
  return `${city}|${raceNumber}`;
}

export async function loadLearnedFeatures(
  env: Env,
  raceDate: string
): Promise<ProgramLearnedFeatures> {
  const byRace:
    ProgramLearnedFeatures =
    new Map();

  const rows =
    await env.DB.prepare(`
      SELECT
        city,
        race_number,
        horse_number,
        features_json
      FROM value_model_predictions
      WHERE race_date = ?
    `)
      .bind(raceDate)
      .all<any>();

  for (const row of rows.results ?? []) {
    let values:
      Array<number | null>;

    try {
      values =
        JSON.parse(
          row.features_json || "[]"
        );
    } catch {
      continue;
    }

    if (!Array.isArray(values)) {
      continue;
    }

    const features:
      LearnedFeatures = {};

    VALUE_MODEL_FEATURES.forEach(
      (name, index) => {
        const value =
          values[index];

        features[
          name as LearnedFeatureName
        ] =
          typeof value === "number" &&
          Number.isFinite(value)
            ? value
            : null;
      }
    );

    const key =
      raceFeatureKey(
        row.city,
        Number(row.race_number)
      );

    const race =
      byRace.get(key) ??
      new Map();

    race.set(
      Number(row.horse_number),
      features
    );

    byRace.set(key, race);
  }

  return byRace;
}
