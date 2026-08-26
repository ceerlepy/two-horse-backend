import type {
  Env
} from "../../env";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import type {
  ExpertSource
} from "../source-types";


export interface ExpertTargetResolution {
  status:
    | "ready"
    | "not-published"
    | "unavailable";

  mode:
    | "article"
    | "direct-current-page";

  targets:
    string[];

  discoveredFromUrl:
    string | null;

  discoveryMethod:
    string | null;

  diagnostics:
    any;
}


export interface ExpertAdapterContext {
  env:
    Env;

  source:
    ExpertSource;

  raceDate:
    string;

  cities:
    string[];
}


export interface ExpertAcquireContext {
  env:
    Env;

  url:
    string;

  sourceKey:
    string;

  raceDate:
    string;

  cities:
    string[];
}


export interface ExpertAdapter {
  sourceKey:
    string;

  resolve(
    context:
      ExpertAdapterContext
  ):
    Promise<
      ExpertTargetResolution
    >;

  /*
   * Lets a source use normal extraction for ordinary
   * article URLs while Browser Session owns only a dynamic
   * terminal/program URL.
   */
  ownsAcquisition?(
    url:
      string
  ):
    boolean;

  acquireHtml?(
    context:
      ExpertAcquireContext
  ):
    Promise<
      AcquiredHtml
    >;
}
