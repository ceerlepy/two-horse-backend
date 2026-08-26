import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


export const horseturkAdapter:
  ExpertAdapter = {
    sourceKey:
      "horseturk",

    resolve(
      context
    ) {
      return resolveArticleAdapter(
        context,
        {
          allowFeed:true,
          verifyTargets:false
        }
      );
    }
  };
