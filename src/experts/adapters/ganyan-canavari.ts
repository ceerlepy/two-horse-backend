import {
  load
} from "cheerio";

import {
  acquireHttpHtml
} from "../../acquisition/http";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  acquireGanyanGalopArticle,
  extractGanyanCommentsSection
} from "./ganyan-article";

import type {
  ExpertAdapter,
  ExpertAdapterContext
} from "./types";


const ROOT =
  "https://www.ganyancanavari.com.tr/";


const MAX_SOURCE_ROUTE_SLOT =
  15;

const PROBE_BATCH_SIZE =
  4;


function citySlug(
  value:string
):string {
  return normalizeExpertSearchText(
    value
  )
    .replace(/\s+/g,"-");
}


function bodyText(
  html:string
):string {
  const $ =
    load(html);

  $(
    "script,style,noscript,svg,canvas,iframe"
  ).remove();

  return $("body")
    .text()
    .replace(/\u00a0/g," ")
    .replace(/[\t\r ]+/g," ")
    .replace(/\n\s+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}


function publicCommentsUrl(
  raceDate:string,
  city:string,
  slot:number
):string {
  const [
    year,
    month,
    day
  ] =
    raceDate.split("-");

  return new URL(
    [
      "site",
      year,
      month,
      day,
      String(slot),
      citySlug(city),
      "gecmis-dereceler.html"
    ].join("/"),
    ROOT
  ).toString();
}


function exactDatePath(
  raceDate:string
):string {
  const [
    year,
    month,
    day
  ] =
    raceDate.split("-");

  return `/${year}/${month}/${day}/`;
}


async function probeSlot(
  context:
    ExpertAdapterContext,

  city:string,
  slot:number
) {
  const requestedUrl =
    publicCommentsUrl(
      context.raceDate,
      city,
      slot
    );

  try {
    const acquired =
      await acquireHttpHtml(
        requestedUrl,
        {
          timeoutMs:
            3_500,

          minimumBytes:
            200,

          userAgent:
            "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
        }
      );

    const text =
      bodyText(
        acquired.html
      );

    const section =
      extractGanyanCommentsSection(
        text,
        city
      );

    const finalUrl =
      acquired.finalUrl ||
      requestedUrl;

    /*
     * Exact date is verified from the final source URL.
     * This prevents a generic/current redirect from being
     * accepted as the historical target.
     */
    const datePathOk =
      new URL(
        finalUrl
      )
        .pathname
        .includes(
          exactDatePath(
            context.raceDate
          )
        );

    const accepted =
      Boolean(
        section
      ) &&
      datePathOk;

    return {
      slot,
      requestedUrl,

      url:
        accepted
          ? finalUrl
          : null,

      status:
        acquired.status,

      bodyLength:
        acquired.bodyLength,

      textCharacters:
        text.length,

      exactCityComments:
        Boolean(section),

      datePathOk,

      error:null
    };

  } catch(error) {
    return {
      slot,
      requestedUrl,
      url:null,
      status:null,
      bodyLength:null,
      textCharacters:null,
      exactCityComments:false,
      datePathOk:false,

      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }
}


async function resolveCity(
  context:
    ExpertAdapterContext,

  city:string
) {
  const attempts:any[] =
    [];

  let anyHttpSuccess =
    false;

  for (
    let start=0;
    start<=MAX_SOURCE_ROUTE_SLOT;
    start+=PROBE_BATCH_SIZE
  ) {
    const slots =
      Array.from(
        {
          length:
            Math.min(
              PROBE_BATCH_SIZE,
              MAX_SOURCE_ROUTE_SLOT -
                start +
                1
            )
        },

        (
          _,
          offset
        ) =>
          start + offset
      );

    const batch =
      await Promise.all(
        slots.map(
          slot =>
            probeSlot(
              context,
              city,
              slot
            )
        )
      );

    attempts.push(
      ...batch
    );

    if (
      batch.some(
        item =>
          item.status ===
            200
      )
    ) {
      anyHttpSuccess =
        true;
    }

    const winner =
      batch.find(
        item =>
          Boolean(
            item.url
          )
      );

    if (
      winner?.url
    ) {
      return {
        city,

        url:
          winner.url,

        discoveredSlot:
          winner.slot,

        anyHttpSuccess,
        attempts
      };
    }
  }

  return {
    city,
    url:null,
    discoveredSlot:null,
    anyHttpSuccess,
    attempts
  };
}


function isPublicCommentsPage(
  value:string
):boolean {
  try {
    const url =
      new URL(value);

    return (
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase() ===
        "ganyancanavari.com.tr" &&

      /\/site\/\d{4}\/\d{2}\/\d{2}\/\d+\/[^/]+\/(?:gecmis-dereceler|galoplar(?:-ozet)?)\.html$/i
        .test(
          url.pathname
        )
    );

  } catch {
    return false;
  }
}


export const ganyanCanavariAdapter:
  ExpertAdapter = {
    sourceKey:
      "ganyan_canavari",

    async resolve(
      context
    ) {
      const results:any[] =
        [];

      for (
        const city of
        context.cities
      ) {
        results.push(
          await resolveCity(
            context,
            city
          )
        );
      }

      const missingCities =
        results
          .filter(
            result =>
              !result.url
          )
          .map(
            result =>
              result.city
          );

      if (
        missingCities.length
      ) {
        return {
          status:
            results.some(
              result =>
                result
                  .anyHttpSuccess
            )
              ? "not-published"
              : "unavailable",

          mode:"article",
          targets:[],

          discoveredFromUrl:
            ROOT,

          discoveryMethod:null,

          diagnostics:{
            traceVersion:
              "ganyan-public-slot-probe-v2",

            architecture:
              "bounded-dynamic-source-slot>http>exact-city-comments",

            results,
            missingCities
          }
        };
      }

      const targets =
        results
          .map(
            result =>
              result.url
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          );

      return {
        status:"ready",
        mode:"article",
        targets,

        discoveredFromUrl:
          ROOT,

        discoveryMethod:
          "bounded-public-source-slot",

        diagnostics:{
          traceVersion:
            "ganyan-public-slot-probe-v2",

          architecture:
            "bounded-dynamic-source-slot>http>exact-city-comments",

          results,
          missingCities:[]
        }
      };
    },

    ownsAcquisition:
      isPublicCommentsPage,

    acquireHtml:
      acquireGanyanGalopArticle
  };
