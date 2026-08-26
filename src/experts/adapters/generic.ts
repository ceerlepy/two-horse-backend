import {
  expertUsesDirectCurrentPage
} from "../source-policy";

import {
  resolveArticleAdapter,
  resolveDirectAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


export const genericExpertAdapter:
  ExpertAdapter = {
    sourceKey:
      "*",

    async resolve(
      context
    ) {
      if (
        expertUsesDirectCurrentPage(
          context.source.source_key
        )
      ) {
        return resolveDirectAdapter(
          context
        );
      }


      return resolveArticleAdapter(
        context,
        {
          allowFeed:true
        }
      );
    }
  };
