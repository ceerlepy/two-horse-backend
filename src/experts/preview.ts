import type {
  Env
} from "../env";

import {
  errorMessage,
  turkeyDate
} from "../shared";

import {
  expertLandingUrls
} from "./source-urls";

import {
  discoverExpertArticleUrls
} from "./discovery";

import {
  expertRequiresDiscoveredArticle,
  isAllowedDiscoveredArticleUrl
} from "./source-policy";

import {
  extractExperts
} from "./extractor";


type PreviewPick = {
  city:string;
  raceNumber:number;
  horseNumber:number;

  horseName?:
    string | null;

  comment?:
    string | null;

  isFavorite:boolean;
  isBanko:boolean;
  isStrong:boolean;
  isStar:boolean;
  isRival:boolean;
  isSurprise:boolean;
  isAvoid:boolean;

  sourceRank:
    number | null;

  confidence:
    number;
};


function pickKey(
  pick:
    PreviewPick
): string {
  return [
    String(pick.city)
      .normalize("NFKC")
      .trim()
      .toLocaleUpperCase("tr-TR"),

    Number(
      pick.raceNumber
    ),

    Number(
      pick.horseNumber
    )
  ].join("|");
}


function mergePick(
  merged:
    Map<string,PreviewPick>,

  incoming:
    PreviewPick
): void {
  const key =
    pickKey(
      incoming
    );

  const previous =
    merged.get(
      key
    );


  if (!previous) {
    merged.set(
      key,
      {
        ...incoming
      }
    );

    return;
  }


  const previousComment =
    String(
      previous.comment ??
      ""
    );

  const incomingComment =
    String(
      incoming.comment ??
      ""
    );


  merged.set(
    key,
    {
      ...previous,

      horseName:
        previous.horseName ??
        incoming.horseName ??
        null,

      comment:
        incomingComment.length >
        previousComment.length
          ? incoming.comment
          : previous.comment,

      isFavorite:
        previous.isFavorite ||
        incoming.isFavorite,

      isBanko:
        previous.isBanko ||
        incoming.isBanko,

      isStrong:
        previous.isStrong ||
        incoming.isStrong,

      isStar:
        previous.isStar ||
        incoming.isStar,

      isRival:
        previous.isRival ||
        incoming.isRival,

      isSurprise:
        previous.isSurprise ||
        incoming.isSurprise,

      isAvoid:
        previous.isAvoid ||
        incoming.isAvoid,

      confidence:
        Math.max(
          Number(
            previous.confidence ??
            0
          ),

          Number(
            incoming.confidence ??
            0
          )
        )
    }
  );
}


function emptyCounts() {
  return {
    races:0,
    total:0,
    main:0,
    favorite:0,
    banko:0,
    strong:0,
    star:0,
    rival:0,
    surprise:0,
    avoid:0
  };
}


export async function previewExpertSource(
  env:
    Env,

  sourceKey:
    string
): Promise<any> {
  const source =
    await env.DB.prepare(`
      SELECT
        source_key,
        source_name,
        homepage_url,
        last_working_url,
        last_discovered_article_url
      FROM source_registry
      WHERE source_key = ?
      LIMIT 1
    `)
      .bind(
        sourceKey
      )
      .first<any>();


  if (!source) {
    return {
      ok:false,
      preview:true,
      persisted:false,
      error:
        "EXPERT_SOURCE_NOT_FOUND"
    };
  }


  const today =
    turkeyDate();


  const meetings =
    await env.DB.prepare(`
      SELECT city
      FROM meetings
      WHERE race_date = ?
      ORDER BY city
    `)
      .bind(
        today
      )
      .all<any>();


  const cities =
    (
      meetings.results ??
      []
    )
      .map(
        row =>
          String(
            row.city
          )
      )
      .filter(Boolean);


  if (!cities.length) {
    return {
      ok:false,
      preview:true,
      persisted:false,
      source:
        sourceKey,
      error:
        "EXPERT_NO_CANONICAL_MEETINGS"
    };
  }


  /*
   * IMPORTANT:
   *
   * Do NOT trust stored last_working_url as the starting
   * point of a cross-source regression preview.
   *
   * Start from each source's verified entry/current-page
   * configuration exactly as normal discovery does.
   */
  const landingUrls =
    expertLandingUrls(
      source as any
    );


  if (!landingUrls.length) {
    return {
      ok:false,
      preview:true,
      persisted:false,
      source:
        sourceKey,
      error:
        "EXPERT_NO_VERIFIED_ENTRY_URL"
    };
  }


  const discoveryAttempts:
    any[] = [];


  const articleUrls:
    string[] = [];


  const articleSeen =
    new Set<string>();


  /*
   * Mirror normal source discovery priority:
   *
   * try source-specific entry URLs in configured order;
   * stop after the first landing that yields accepted
   * current article candidates.
   */
  for (
    const landingUrl of
    landingUrls
  ) {
    try {
      const discovery =
        await discoverExpertArticleUrls(
          env,
          landingUrl,
          String(
            source.source_name
          ),
          cities
        );


      const accepted =
        discovery.urls
          .filter(
            candidate =>
              !landingUrls.includes(
                candidate
              )
          )
          .filter(
            candidate =>
              isAllowedDiscoveredArticleUrl(
                sourceKey,
                candidate
              )
          );


      discoveryAttempts.push({
        landingUrl,

        method:
          discovery.method,

        selected:
          discovery.urls.length,

        accepted:
          accepted.length,

        acceptedUrls:
          accepted
      });


      for (
        const articleUrl of
        accepted
      ) {
        if (
          articleSeen.has(
            articleUrl
          )
        ) {
          continue;
        }

        articleSeen.add(
          articleUrl
        );

        articleUrls.push(
          articleUrl
        );
      }


      /*
       * Same priority behavior as production:
       *
       * once this source's preferred landing proves one or
       * more current articles, do not keep burning discovery
       * calls on lower-priority entry pages.
       */
      if (
        accepted.length >
        0
      ) {
        break;
      }

    } catch (error) {
      discoveryAttempts.push({
        landingUrl,

        method:
          "failed",

        selected:
          0,

        accepted:
          0,

        acceptedUrls:
          [],

        error:
          errorMessage(
            error
          )
      });
    }
  }


  const requiresArticle =
    expertRequiresDiscoveredArticle(
      sourceKey
    );


  /*
   * Liderform-style source:
   *
   * an explicit daily article is mandatory.
   */
  if (
    requiresArticle &&
    articleUrls.length ===
      0
  ) {
    return {
      ok:true,

      preview:true,

      persisted:false,

      status:
        "article-not-published",

      source:
        sourceKey,

      date:
        today,

      cities,

      mode:
        "discovered-article-required",

      discovery:
        discoveryAttempts,

      extractionAttempts:
        [],

      counts:
        emptyCounts(),

      mainPicks:
        [],

      rivalsByRace:
        [],

      completenessByArticle:
        []
    };
  }


  /*
   * If discovery found real current articles, extract all
   * accepted articles from that successful source landing.
   *
   * This is important for sources such as a magazine/site
   * that may publish separate current city articles.
   *
   * If no article was discovered and the source is allowed
   * to publish directly on a stable/current page, use the
   * configured source landing URLs as extraction candidates.
   */
  const extractionMode =
    articleUrls.length >
      0
      ? "discovered-articles"
      : "direct-current-page";


  const extractionUrls =
    articleUrls.length >
      0
      ? articleUrls
      : landingUrls;


  const extractionAttempts:
    any[] = [];


  const completenessByArticle:
    any[] = [];


  const merged =
    new Map<
      string,
      PreviewPick
    >();


  let hadSemanticResponse =
    false;


  let totalPromptTokens =
    0;


  let totalCompletionTokens =
    0;


  let totalTokens =
    0;


  let totalNeurons =
    0;


  /*
   * ARTICLE MODE:
   *
   * Extract every current article selected from the
   * successful landing. This gives a source-level preview
   * instead of arbitrarily showing only one city/article.
   *
   * DIRECT CURRENT-PAGE MODE:
   *
   * configured URLs are alternatives, so stop at the first
   * one that actually yields usable picks.
   */
  for (
    const extractionUrl of
    extractionUrls
  ) {
    try {
      const extracted =
        await extractExperts(
          env,
          extractionUrl,
          String(
            source.source_name
          )
        );


      hadSemanticResponse =
        true;


      const picks =
        extracted
          .extraction
          .picks as
          PreviewPick[];


      const diagnostics =
        extracted
          .diagnostics as any;


      const usage =
        diagnostics
          ?.semantic
          ?.usage ??
        {};


      totalPromptTokens +=
        Number(
          usage.prompt_tokens ??
          0
        );


      totalCompletionTokens +=
        Number(
          usage.completion_tokens ??
          0
        );


      totalTokens +=
        Number(
          usage.total_tokens ??
          0
        );


      totalNeurons +=
        Number(
          usage.neurons ??
          0
        );


      extractionAttempts.push({
        url:
          extractionUrl,

        status:
          extracted.status,

        method:
          extracted.method,

        picks:
          picks.length,

        articleText: {
          selectedRoot:
            diagnostics
              ?.articleText
              ?.selectedRoot ??
            null,

          characters:
            diagnostics
              ?.articleText
              ?.outputCharacters ??
            null,

          truncated:
            diagnostics
              ?.articleText
              ?.truncated ??
            null
        },

        usage: {
          promptTokens:
            Number(
              usage.prompt_tokens ??
              0
            ),

          completionTokens:
            Number(
              usage.completion_tokens ??
              0
            ),

          totalTokens:
            Number(
              usage.total_tokens ??
              0
            ),

          neurons:
            Number(
              usage.neurons ??
              0
            )
        }
      });


      completenessByArticle.push({
        url:
          extractionUrl,

        completeness:
          diagnostics
            ?.completeness ??
          null
      });


      for (
        const pick of
        picks
      ) {
        mergePick(
          merged,
          pick
        );
      }


      if (
        extractionMode ===
          "direct-current-page" &&
        picks.length >
          0
      ) {
        break;
      }

    } catch (error) {
      extractionAttempts.push({
        url:
          extractionUrl,

        status:
          "failed",

        error:
          errorMessage(
            error
          )
      });


      /*
       * For alternative direct pages, continue to the next
       * configured entry.
       *
       * For article mode, one broken article must not hide
       * results from another current article.
       */
      continue;
    }
  }


  const picks =
    [
      ...merged.values()
    ];


  const isMain =
    (
      pick:
        PreviewPick
    ) =>
      Boolean(
        pick.isFavorite ||
        pick.isBanko ||
        pick.isStrong ||
        pick.isStar ||
        pick.isSurprise
      );


  const countFlag =
    (
      key:
        | "isFavorite"
        | "isBanko"
        | "isStrong"
        | "isStar"
        | "isRival"
        | "isSurprise"
        | "isAvoid"
    ) =>
      picks.filter(
        pick =>
          Boolean(
            pick[key]
          )
      ).length;


  const mainPicks =
    picks
      .filter(
        isMain
      )
      .map(
        pick => ({
          city:
            pick.city,

          raceNumber:
            pick.raceNumber,

          horseNumber:
            pick.horseNumber,

          horseName:
            pick.horseName ??
            null,

          comment:
            pick.comment ??
            null,

          labels: [
            pick.isFavorite
              ? "favorite"
              : null,

            pick.isBanko
              ? "banko"
              : null,

            pick.isStrong
              ? "strong"
              : null,

            pick.isStar
              ? "star"
              : null,

            pick.isSurprise
              ? "surprise"
              : null
          ]
            .filter(Boolean),

          confidence:
            pick.confidence
        })
      )
      .sort(
        (a,b) =>
          String(a.city)
            .localeCompare(
              String(b.city),
              "tr"
            ) ||
          Number(
            a.raceNumber
          ) -
          Number(
            b.raceNumber
          ) ||
          Number(
            a.horseNumber
          ) -
          Number(
            b.horseNumber
          )
      );


  const rivals =
    new Map<
      string,
      {
        city:string;
        raceNumber:number;
        horseNumbers:number[];
      }
    >();


  for (
    const pick of
    picks
  ) {
    if (!pick.isRival) {
      continue;
    }


    const key =
      [
        pick.city,
        pick.raceNumber
      ].join("|");


    const existing =
      rivals.get(
        key
      ) ??
      {
        city:
          pick.city,

        raceNumber:
          pick.raceNumber,

        horseNumbers:
          []
      };


    existing
      .horseNumbers
      .push(
        pick.horseNumber
      );


    rivals.set(
      key,
      existing
    );
  }


  const rivalsByRace =
    [
      ...rivals.values()
    ]
      .map(
        row => ({
          ...row,

          horseNumbers:
            [
              ...new Set(
                row.horseNumbers
              )
            ]
              .sort(
                (a,b) =>
                  a-b
              )
        })
      )
      .sort(
        (a,b) =>
          String(a.city)
            .localeCompare(
              String(b.city),
              "tr"
            ) ||
          a.raceNumber -
          b.raceNumber
      );


  const races =
    new Set(
      picks.map(
        pick =>
          [
            pick.city,
            pick.raceNumber
          ].join("|")
      )
    );


  /*
   * No extraction error + zero picks is a valid diagnostic
   * semantic-empty result.
   *
   * If every candidate technically failed, expose that
   * clearly instead of pretending the source had no picks.
   */
  if (
    picks.length ===
      0 &&
    !hadSemanticResponse
  ) {
    return {
      ok:false,

      preview:true,

      persisted:false,

      status:
        "extraction-failed",

      source:
        sourceKey,

      date:
        today,

      cities,

      mode:
        extractionMode,

      discovery:
        discoveryAttempts,

      extractionAttempts,

      error:
        "EXPERT_PREVIEW_EXTRACTION_FAILED"
    };
  }


  return {
    ok:true,

    preview:true,

    persisted:false,

    status:
      picks.length >
        0
        ? "success"
        : "semantic-empty",

    source:
      sourceKey,

    date:
      today,

    cities,

    mode:
      extractionMode,

    discoveredArticleUrls:
      articleUrls,

    extractionUrls,

    discovery:
      discoveryAttempts,

    extractionAttempts,

    counts: {
      races:
        races.size,

      total:
        picks.length,

      main:
        mainPicks.length,

      favorite:
        countFlag(
          "isFavorite"
        ),

      banko:
        countFlag(
          "isBanko"
        ),

      strong:
        countFlag(
          "isStrong"
        ),

      star:
        countFlag(
          "isStar"
        ),

      rival:
        countFlag(
          "isRival"
        ),

      surprise:
        countFlag(
          "isSurprise"
        ),

      avoid:
        countFlag(
          "isAvoid"
        )
    },

    mainPicks,

    rivalsByRace,

    completenessByArticle,

    semanticUsage: {
      promptTokens:
        totalPromptTokens,

      completionTokens:
        totalCompletionTokens,

      totalTokens,

      neurons:
        totalNeurons
    }
  };
}
