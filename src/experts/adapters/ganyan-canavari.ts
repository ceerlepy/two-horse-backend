import {
  load
} from "cheerio";

import {
  acquireHttpHtml
} from "../../acquisition/http";

import {
  acquireCfContentHtml
} from "../../acquisition/cloudflare-html";

import {
  acquireCfLinks
} from "../../acquisition/cloudflare-links";

import {
  normalizeExpertSearchText
} from "../text-normalization";

import {
  acquireGanyanGalopArticle
} from "./ganyan-article";

import type {
  ExpertAdapter,
  ExpertAdapterContext
} from "./types";


const ROOT =
  "https://www.ganyancanavari.com.tr/";


function slug(
  value:string
):string {
  return normalizeExpertSearchText(
    value
  )
    .replace(/\s+/g,"-");
}


function linksFromHtml(
  base:string,
  html:string
):string[] {
  const $=
    load(html);

  const urls:string[]=
    [];

  $("a[href]").each(
    (
      _index,
      element
    ) => {
      const href=
        $(element)
          .attr("href");

      if (!href)
        return;

      try {
        urls.push(
          new URL(
            href,
            base
          ).toString()
        );
      } catch {
        // ignore malformed source URL
      }
    }
  );

  return [
    ...new Set(urls)
  ];
}


function targetPublicGalop(
  city:string,
  raceDate:string,
  values:string[]
):string|null {
  const [
    year,
    month,
    day
  ] =
    raceDate.split("-");

  const datePath =
    `/${year}/${month}/${day}/`;

  const cityPath =
    `/${slug(city)}/`;

  const matches =
    values
      .filter(
        value => {
          try {
            const url=
              new URL(value);

            const host=
              url.hostname
                .replace(/^www\./,"")
                .toLowerCase();

            const path=
              decodeURIComponent(
                url.pathname
              )
                .normalize("NFKD")
                .toLowerCase()
                .replace(/\p{M}/gu,"")
                .replace(/ı/g,"i")
                .replace(/ş/g,"s")
                .replace(/ğ/g,"g")
                .replace(/ü/g,"u")
                .replace(/ö/g,"o")
                .replace(/ç/g,"c");

            return (
              host ===
                "ganyancanavari.com.tr" &&
              path.includes(
                datePath
              ) &&
              path.includes(
                cityPath
              ) &&
              /\/galoplar(?:-ozet)?\.html$/
                .test(path)
            );

          } catch {
            return false;
          }
        }
      )
      .sort(
        (a,b) => {
          /*
           * Full galop page first,
           * özet is valid fallback.
           */
          const aSummary=
            /galoplar-ozet\.html$/i
              .test(a)
              ? 1
              : 0;

          const bSummary=
            /galoplar-ozet\.html$/i
              .test(b)
              ? 1
              : 0;

          return aSummary-bSummary;
        }
      );

  return matches[0] ?? null;
}


async function resolveCity(
  context:
    ExpertAdapterContext,
  city:string
) {
  const query=
    new URL(ROOT);

  query.searchParams.set(
    "q",
    `${city} ${context.raceDate} galoplar`
  );

  const attempts:any[]=
    [];


  /*
   * Old HorsAI principle:
   * HTTP first.
   */
  try {
    const acquired=
      await acquireHttpHtml(
        query.toString(),
        {
          timeoutMs:5_000,
          minimumBytes:200,

          userAgent:
            "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36"
        }
      );

    const selected=
      targetPublicGalop(
        city,
        context.raceDate,
        linksFromHtml(
          acquired.finalUrl ??
            query.toString(),
          acquired.html
        )
      );

    attempts.push({
      stage:"http",
      bodyLength:
        acquired.bodyLength,
      selected
    });

    if (selected) {
      return {
        url:selected,
        attempts
      };
    }

  } catch(error) {
    attempts.push({
      stage:"http",
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }


  /*
   * Rendered HTML fallback.
   */
  try {
    const acquired=
      await acquireCfContentHtml(
        context.env,
        query.toString()
      );

    const selected=
      targetPublicGalop(
        city,
        context.raceDate,
        linksFromHtml(
          query.toString(),
          acquired.html
        )
      );

    attempts.push({
      stage:"cf-content",
      bodyLength:
        acquired.bodyLength,
      selected
    });

    if (selected) {
      return {
        url:selected,
        attempts
      };
    }

  } catch(error) {
    attempts.push({
      stage:"cf-content",
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });
  }


  /*
   * Link-only last discovery fallback.
   */
  try {
    const acquired=
      await acquireCfLinks(
        context.env,
        query.toString()
      );

    const selected=
      targetPublicGalop(
        city,
        context.raceDate,
        acquired.links
      );

    attempts.push({
      stage:"cf-links",
      linkCount:
        acquired.links.length,
      selected
    });

    return {
      url:selected,
      attempts
    };

  } catch(error) {
    attempts.push({
      stage:"cf-links",
      error:
        error instanceof Error
          ? error.message
          : String(error)
    });

    return {
      url:null,
      attempts
    };
  }
}


function isPublicGalop(
  value:string
):boolean {
  try {
    const url=
      new URL(value);

    return (
      url.hostname
        .replace(/^www\./,"")
        .toLowerCase() ===
        "ganyancanavari.com.tr" &&
      /\/site\/\d{4}\/\d{2}\/\d{2}\/\d+\/[^/]+\/galoplar(?:-ozet)?\.html$/i
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

    async resolve(context) {
      const results=
        [];

      for (
        const city of
        context.cities
      ) {
        results.push({
          city,
          ...await resolveCity(
            context,
            city
          )
        });
      }

      const missing=
        results
          .filter(
            result =>
              !result.url
          )
          .map(
            result =>
              result.city
          );

      if (missing.length) {
        return {
          status:"not-published",
          mode:"article",
          targets:[],
          discoveredFromUrl:ROOT,
          discoveryMethod:null,

          diagnostics:{
            traceVersion:
              "ganyan-public-galop-v1",

            results,
            missingCities:
              missing
          }
        };
      }

      return {
        status:"ready",
        mode:"article",

        targets:
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
            ),

        discoveredFromUrl:
          ROOT,

        discoveryMethod:
          "source-search-public-galop",

        diagnostics:{
          traceVersion:
            "ganyan-public-galop-v1",

          results,
          missingCities:[]
        }
      };
    },

    ownsAcquisition:
      isPublicGalop,

    acquireHtml:
      acquireGanyanGalopArticle
  };
