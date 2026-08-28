import {
  turkeyDate
} from "../../shared";

import {
  resolveDirectAdapter
} from "./common";

import {
  acquireHttpFirstArticleHtml
} from "./verified-article";

import {
  raceDateParts
} from "./article-url-utils";

import {
  prepareRaceProseArticle
} from "./race-prose";

import type {
  ExpertAdapter
} from "./types";


const ROOT =
  "https://istinyeganyan.com/";

const CURRENT =
  "https://istinyeganyan.com/ganyan/tahminler/";


const MONTHS = [
  "OCAK",
  "ŞUBAT",
  "MART",
  "NİSAN",
  "MAYIS",
  "HAZİRAN",
  "TEMMUZ",
  "AĞUSTOS",
  "EYLÜL",
  "EKİM",
  "KASIM",
  "ARALIK"
];


const WEEKDAYS = [
  "PAZAR",
  "PAZARTESİ",
  "SALI",
  "ÇARŞAMBA",
  "PERŞEMBE",
  "CUMA",
  "CUMARTESİ"
];


function historicalUrl(
  city:string,
  raceDate:string
):string {
  const parts =
    raceDateParts(
      raceDate
    );

  const date =
    new Date(
      Date.UTC(
        parts.year,
        parts.month-1,
        parts.day,
        12
      )
    );

  const title =
    [
      parts.day,

      MONTHS[
        parts.month-1
      ],

      WEEKDAYS[
        date.getUTCDay()
      ],

      city.toLocaleUpperCase(
        "tr-TR"
      ),

      "ALTILI GANYAN TAHMİNLERİ"
    ].join(" ");

  /*
   * This is the source's real WordPress Unicode slug format.
   */
  const slug =
    title
      .toLowerCase()
      .replace(
        /[^\p{L}\p{N}\p{M}]+/gu,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );

  return new URL(
    `${slug}/`,
    ROOT
  ).toString();
}


function ownsHistorical(
  value:string
):boolean {
  try {
    const url =
      new URL(value);

    return (
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase() ===
        "istinyeganyan.com" &&

      url.toString() !==
        CURRENT &&

      !url.pathname
        .toLowerCase()
        .startsWith(
          "/kategori/"
        )
    );

  } catch {
    return false;
  }
}


export const istinyeGanyanAdapter:
  ExpertAdapter = {
    sourceKey:
      "istinye_ganyan",

    resolve(context) {
      if (
        context.raceDate >=
          turkeyDate()
      ) {
        return resolveDirectAdapter(
          context
        );
      }

      const targets =
        context.cities.map(
          city =>
            historicalUrl(
              city,
              context.raceDate
            )
        );

      return Promise.resolve({
        status:"ready",
        mode:"article",

        targets,

        discoveredFromUrl:
          ROOT,

        discoveryMethod:
          "deterministic-source-url",

        diagnostics:{
          traceVersion:
            "istinye-deterministic-v2",

          cities:
            context.cities,

          targets,

          networkDiscovery:
            false
        }
      });
    },

    ownsAcquisition(
      url
    ) {
      return ownsHistorical(
        url
      );
    },

    acquireHtml(
      context
    ) {
      return acquireHttpFirstArticleHtml(
        context,
        {
          /*
           * HTTP first.
           *
           * If HTTP gives real target article:
           * STOP.
           *
           * Otherwise:
           * CF Content -> CF Scrape -> browser.
           */
          allowPuppeteer:true,

          prepareAcquired:
            acquired =>
              prepareRaceProseArticle(
                context,
                acquired,
                "ISTINYE GANYAN"
              )
        }
      );
    }
  };
