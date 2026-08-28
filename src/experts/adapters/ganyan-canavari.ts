import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  acquireGanyanGalopArticle,
  resolveGanyanGalopArticles
} from "./ganyan-article";

import type {
  ExpertAdapter
} from "./types";


function ownsGalopArticle(
  value:string
):boolean {
  try {
    const url =
      new URL(value);

    const host =
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase();

    const material =
      normalizeExpertSearchText(
        decodeURIComponent(
          url.pathname
        )
      );

    return (
      host ===
        "ganyancanavari.com.tr" &&
      material.includes(
        "haber detay"
      ) &&
      material.includes(
        "galop incelemesi"
      )
    );

  } catch {
    return false;
  }
}


export const ganyanCanavariAdapter:
  ExpertAdapter = {
    sourceKey:
      "ganyan_canavari",

    resolve:
      resolveGanyanGalopArticles,

    ownsAcquisition:
      ownsGalopArticle,

    acquireHtml:
      acquireGanyanGalopArticle
  };
