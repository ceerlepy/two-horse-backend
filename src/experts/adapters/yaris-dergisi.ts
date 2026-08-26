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
      /*
       * Keep positive date/city evidence inside this source's
       * own article/card. Never re-enable broad global parent
       * traversal which caused stale article contamination.
       */
      return resolveArticleAdapter(
        context,
        {
          preferCards:true,

          cardSelectors:[
            "article",
            ".post",
            ".entry",
            "[class*='post']",
            "[class*='article']"
          ],

          verifyTargets:true,
          requireCityCoverage:true,

          allowGeneric:false,
          allowFeed:true
        }
      );
    }
  };
