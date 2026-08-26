import type {
  Env
} from "../env";

import type {
  ExpertSource
} from "./source-types";

import {
  expertAdapterFor
} from "./adapters/registry";

import type {
  ExpertTargetResolution
} from "./adapters/types";


export type {
  ExpertTargetResolution
} from "./adapters/types";


export async function resolveExpertSourceTargets(
  env:
    Env,

  source:
    ExpertSource,

  raceDate:
    string,

  cities:
    string[]
): Promise<ExpertTargetResolution> {
  const adapter =
    expertAdapterFor(
      source.source_key
    );


  return adapter.resolve({
    env,
    source,
    raceDate,
    cities
  });
}
