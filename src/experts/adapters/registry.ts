import type {
  ExpertAdapter
} from "./types";

import {
  genericExpertAdapter
} from "./generic";

import {
  liderformAdapter
} from "./liderform";

import {
  yarisDergisiAdapter
} from "./yaris-dergisi";

import {
  bankoTahminlerAdapter
} from "./banko-tahminler";

import {
  horseturkAdapter
} from "./horseturk";

import {
  yarisAnaliziAdapter
} from "./yaris-analizi";

import {
  istinyeGanyanAdapter
} from "./istinye-ganyan";

import {
  ganyanCanavariAdapter
} from "./ganyan-canavari";

import {
  afaAdapter
} from "./afa";


const registeredAdapters:
  ExpertAdapter[] = [
    liderformAdapter,
    yarisDergisiAdapter,
    bankoTahminlerAdapter,
    horseturkAdapter,
    yarisAnaliziAdapter,
    istinyeGanyanAdapter,
    ganyanCanavariAdapter,
    afaAdapter
  ];


const adapters =
  new Map<
    string,
    ExpertAdapter
  >(
    registeredAdapters.map(
      adapter =>
        [
          adapter.sourceKey,
          adapter
        ] as const
    )
  );


export function expertAdapterFor(
  sourceKey:
    string
): ExpertAdapter {
  return (
    adapters.get(
      sourceKey
    ) ??
    genericExpertAdapter
  );
}
