import {
  resolveArticleAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


export const yarisAnaliziAdapter:
  ExpertAdapter = {
    sourceKey:
      "yaris_analizi",

    resolve(
      context
    ) {
      /*
       * Discovery remains public.
       * Extraction may legitimately classify article content
       * as access-restricted. Do not bypass VIP protection.
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
