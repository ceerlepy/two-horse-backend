import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


export const liderformAdapter:
  ExpertAdapter = {
    sourceKey:
      "liderform",

    resolve(
      context
    ) {
      /*
       * Reference implementation.
       * Keep its proven discovery behavior isolated and stable.
       */
      return resolveArticleAdapter(
        context,
        {
          allowFeed:true,
          verifyTargets:false
        }
      );
    }
  };
