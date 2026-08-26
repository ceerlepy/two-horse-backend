import {
  turkeyDate
} from "../../shared";

import {
  resolveArticleAdapter,
  resolveDirectAdapter
} from "./common";

import type {
  ExpertAdapter
} from "./types";


const ARCHIVE =
  "https://istinyeganyan.com/kategori/at-yarisi/";


export const istinyeGanyanAdapter:
  ExpertAdapter = {
    sourceKey:
      "istinye_ganyan",

    resolve(
      context
    ) {
      if (
        context.raceDate <
          turkeyDate()
      ) {
        return resolveArticleAdapter(
          context,
          {
            landingUrls:[
              ARCHIVE
            ],

            verifyTargets:true,
            requireCityCoverage:true,
            allowGeneric:true,
            allowFeed:true
          }
        );
      }

      return resolveDirectAdapter(
        context
      );
    }
  };
