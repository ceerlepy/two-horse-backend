import {
  acquireGanyanGalopArticle,
  resolveGanyanGalopArticles
} from "./ganyan-article";

import type {
  ExpertAdapter
} from "./types";


export const ganyanCanavariAdapter:
  ExpertAdapter = {
    sourceKey:
      "ganyan_canavari",

    resolve(
      context
    ) {
      return resolveGanyanGalopArticles(
        context
      );
    },

    ownsAcquisition(
      url
    ) {
      try {
        const material =
          decodeURIComponent(
            new URL(url)
              .pathname
          )
            .toLocaleLowerCase(
              "tr-TR"
            );

        return (
          material.includes(
            "/haber-detay/"
          ) &&
          material.includes(
            "galop-incelemesi"
          )
        );

      } catch {
        return false;
      }
    },

    acquireHtml(
      context
    ) {
      return acquireGanyanGalopArticle(
        context
      );
    }
  };
