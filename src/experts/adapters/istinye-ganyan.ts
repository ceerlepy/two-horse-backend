import {
  turkeyDate
} from "../../shared";

import {
  resolveDirectAdapter
} from "./common";

import {
  createVerifiedArticleAdapter
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

const ARCHIVE =
  "https://istinyeganyan.com/kategori/at-yarisi/";


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

  const slug =
    title
      .toLowerCase()
      /*
       * Default toLowerCase() maps "İ" to the decomposed
       * "i" + combining-dot-above (U+0307) instead of a
       * plain "i", which the site's own slugs never carry.
       * Collapse that sequence back to plain "i" before the
       * slug charset filter, which otherwise lets the
       * combining mark survive into the URL and 404.
       */
      .replace(
        /i̇/g,
        "i"
      )
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


function ownsHistoricalArticle(
  value:string
):boolean {
  try {
    const url =
      new URL(value);

    const host =
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase();

    const path =
      url.pathname
        .toLowerCase();

    return (
      host ===
        "istinyeganyan.com" &&

      path !== "/" &&

      !path.startsWith(
        "/kategori/"
      ) &&

      !path.startsWith(
        "/ganyan/"
      )
    );

  } catch {
    return false;
  }
}


const historicalAdapter =
  createVerifiedArticleAdapter({
    sourceKey:
      "istinye_ganyan",

    sourceName:
      "İstinye Ganyan",

    ownsArticle:
      ownsHistoricalArticle,

    /*
     * Pattern-first.
     * This is only a CANDIDATE, never blindly READY.
     */
    directCandidates(
      context
    ) {
      return context.cities.map(
        city => ({
          city,

          url:
            historicalUrl(
              city,
              context.raceDate
            )
        })
      );
    },

    /*
     * Direct candidate fails strict verification:
     * discover actual published href.
     */
    discoveryUrls() {
      return [
        CURRENT,
        ARCHIVE
      ];
    },

    listingCardContext:
      true,

    requireCandidateDateEvidence:
      true,

    maxCandidates:10,
    maxVerifiedPerCity:1,

    allowPuppeteerDiscovery:true,
    allowPuppeteerArticle:true,

    adapterOwnedExtraction:true,

    prepareArticleHtml(
      context,
      acquired
    ) {
      return prepareRaceProseArticle(
        context,
        acquired,
        "ISTINYE GANYAN"
      );
    },

    browserNavigationBudget:4,

    fallback:"feed"
  });


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

      return historicalAdapter
        .resolve(context);
    },

    ownsAcquisition(url) {
      return Boolean(
        historicalAdapter
          .ownsAcquisition?.(
            url
          )
      );
    },

    acquireHtml(context) {
      const acquire =
        historicalAdapter
          .acquireHtml;

      if (!acquire) {
        throw new Error(
          "ISTINYE_ACQUISITION_MISSING"
        );
      }

      return acquire(
        context
      );
    }
  };
