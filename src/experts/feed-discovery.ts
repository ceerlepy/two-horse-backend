import {
  load
} from "cheerio";

import type {
  Env
} from "../env";

import {
  expertSourceConfig
} from "../config/expert-acquisition";

import {
  candidateEvidence
} from "./discovery";

import {
  isAllowedDiscoveredArticleUrl
} from "./source-policy";

import {
  selectExpertCandidateUrlsWithWorkersAi
} from "./workers-ai-discovery";

import {
  cleanExpertInlineText
} from "./text-normalization";


interface FeedCandidate {
  url:
    string;

  text:
    string;

  score:
    number;

  matchedCities:
    string[];
}


function normalizeUrl(
  base:
    string,

  value:
    string
): string | null {
  try {
    const url =
      new URL(
        value,
        base
      );

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    url.hash = "";

    return url.toString();

  } catch {
    return null;
  }
}


function publishedIso(
  value:
    string
): string {
  const parsed =
    Date.parse(
      value
    );


  if (
    Number.isNaN(
      parsed
    )
  ) {
    return "";
  }


  return new Date(
    parsed
  )
    .toISOString()
    .slice(
      0,
      10
    );
}


export async function discoverExpertFeedUrls(
  env:
    Env,

  sourceKey:
    string,

  sourceName:
    string,

  raceDate:
    string,

  cities:
    string[]
) {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const feedUrls =
    source.feedUrls ??
    [];


  const diagnostics:any = {
    configured:
      feedUrls.length > 0,

    feeds:[],
    candidateCount:0,
    selected:[],
    aiError:null
  };


  if (!feedUrls.length) {
    return {
      configured:false,
      urls:[],
      method:null,
      discoveredFromUrl:null,
      diagnostics
    };
  }


  const candidates =
    new Map<
      string,
      FeedCandidate
    >();


  for (
    const feedUrl of
    feedUrls
  ) {
    const controller =
      new AbortController();


    const timer =
      setTimeout(
        () =>
          controller.abort(),
        20_000
      );


    try {
      const response =
        await fetch(
          feedUrl,
          {
            signal:
              controller.signal,

            headers:{
              "accept":
                "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5"
            }
          }
        );


      if (!response.ok) {
        diagnostics.feeds.push({
          feedUrl,
          status:
            response.status,

          error:
            `FEED_HTTP_${response.status}`
        });

        continue;
      }


      const xml =
        await response.text();


      const $ =
        load(
          xml,
          {
            xmlMode:true
          }
        );


      let itemCount=0;
      let eligibleCount=0;


      $("item, entry")
        .each(
          (
            _index,
            element
          ) => {
            itemCount++;


            const item =
              $(element);


            const title =
              cleanExpertInlineText(
                item
                  .find("title")
                  .first()
                  .text(),
                500
              );


            const rawLink =
              item
                .find("link")
                .first()
                .attr("href") ??
              item
                .find("link")
                .first()
                .text();


            const url =
              normalizeUrl(
                feedUrl,
                rawLink
              );


            if (
              !url ||
              !isAllowedDiscoveredArticleUrl(
                sourceKey,
                url
              )
            ) {
              return;
            }


            const publication =
              cleanExpertInlineText(
                [
                  item
                    .find("pubDate")
                    .first()
                    .text(),

                  item
                    .find("published")
                    .first()
                    .text(),

                  item
                    .find("updated")
                    .first()
                    .text()
                ]
                  .filter(Boolean)
                  .join(" "),
                300
              );


            const description =
              cleanExpertInlineText(
                [
                  item
                    .find("description")
                    .first()
                    .text(),

                  item
                    .find(
                      "content\\:encoded"
                    )
                    .first()
                    .text(),

                  item
                    .find("summary")
                    .first()
                    .text()
                ]
                  .filter(Boolean)
                  .join(" "),
                1400
              );


            const text =
              cleanExpertInlineText(
                [
                  title,
                  publication,
                  publishedIso(
                    publication
                  ),
                  description
                ]
                  .filter(Boolean)
                  .join(" | "),
                1800
              );


            const evidence =
              candidateEvidence(
                sourceKey,
                url,
                text,
                raceDate,
                cities,
                title
              );


            if (
              !evidence.hasDate ||
              !evidence.hasCity ||
              !evidence
                .hasPredictionLanguage ||
              evidence
                .hasNegativeLanguage
            ) {
              return;
            }


            eligibleCount++;


            const previous =
              candidates.get(
                url
              );


            const candidate:
              FeedCandidate = {
                url,
                text,
                score:
                  evidence.score,

                matchedCities:
                  evidence
                    .matchedCities
              };


            if (
              !previous ||
              candidate.score >
                previous.score ||
              (
                candidate.score ===
                  previous.score &&
                candidate.text.length >
                  previous.text.length
              )
            ) {
              candidates.set(
                url,
                candidate
              );
            }
          }
        );


      diagnostics.feeds.push({
        feedUrl,

        status:
          response.status,

        characters:
          xml.length,

        itemCount,
        eligibleCount
      });

    } catch(error) {
      diagnostics.feeds.push({
        feedUrl,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });

    } finally {
      clearTimeout(
        timer
      );
    }
  }


  const values =
    [
      ...candidates.values()
    ]
      .sort(
        (
          a,
          b
        ) =>
          b.score -
          a.score
      );


  diagnostics.candidateCount =
    values.length;


  if (!values.length) {
    return {
      configured:true,
      urls:[],
      method:
        "feed-empty",
      discoveredFromUrl:
        feedUrls[0] ??
        null,
      diagnostics
    };
  }


  try {
    const semantic =
      await selectExpertCandidateUrlsWithWorkersAi(
        env,
        {
          sourceName,
          raceDate,
          cities,

          candidates:
            values.map(
              candidate => ({
                url:
                  candidate.url,

                text:
                  candidate.text,

                score:
                  candidate.score
              })
            )
        }
      );


    const allowed =
      new Set(
        values.map(
          candidate =>
            candidate.url
        )
      );


    const selected =
      [
        ...new Set(
          (
            semantic.urls ??
            []
          )
            .map(
              value =>
                normalizeUrl(
                  feedUrls[0],
                  String(value)
                )
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
            .filter(
              value =>
                allowed.has(
                  value
                )
            )
            .filter(
              value =>
                isAllowedDiscoveredArticleUrl(
                  sourceKey,
                  value
                )
            )
        )
      ];


    diagnostics.selected =
      selected;

    diagnostics.semantic =
      semantic.diagnostics;


    return {
      configured:true,

      urls:
        selected,

      method:
        "feed-workers-ai-candidate-selection",

      discoveredFromUrl:
        feedUrls[0] ??
        null,

      diagnostics
    };

  } catch(error) {
    diagnostics.aiError =
      error instanceof Error
        ? error.message
        : String(error);


    return {
      configured:true,
      urls:[],

      method:
        "feed-ai-failed",

      discoveredFromUrl:
        feedUrls[0] ??
        null,

      diagnostics
    };
  }
}
