import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


export const yarisDergisiAdapter:
  ExpertAdapter = {
    sourceKey:
      "yaris_dergisi",

    resolve(
      context
    ) {
      return resolveArticleAdapter(
        context,
        {
          verifyTargets:true,
          requireCityCoverage:true,
          allowGeneric:true,
          allowFeed:true
        }
      );
    }
  };
