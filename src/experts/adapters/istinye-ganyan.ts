import { turkeyDate } from "../../shared";
import { resolveArticleAdapter, resolveDirectAdapter } from "./common";
import { acquireResilientArticleHtml, resolveResilientArticleTargets } from "./resilient-article";
import type { ExpertAdapter, ExpertAdapterContext, ExpertTargetResolution } from "./types";

const ARCHIVE="https://istinyeganyan.com/kategori/at-yarisi/";
const CURRENT="https://istinyeganyan.com/ganyan/tahminler/";
const LIST_READY="article a[href],.post a[href],.entry a[href],h2 a[href],h3 a[href]";
const ARTICLE_READY="article,main,.entry-content,.post-content,[role='main'],h1";

function ownsHistorical(value:string) {
  try {
    const u=new URL(value);
    const host=u.hostname.replace(/^www\./,"").toLowerCase();

    return (
      host==="istinyeganyan.com" &&
      u.toString()!==CURRENT &&
      !u.pathname
        .toLowerCase()
        .startsWith("/kategori/")
    );
  } catch {
    return false;
  }
}

async function resolveHistorical(
  context:ExpertAdapterContext
):Promise<ExpertTargetResolution> {
  const ladder=
    await resolveResilientArticleTargets(
      context,
      {
        landingUrls:[ARCHIVE],
        readySelector:LIST_READY,
        maxPages:5,
        urlPredicate:ownsHistorical
      }
    );

  if (ladder.status==="ready")
    return ladder;

  const fallback=
    await resolveArticleAdapter(
      context,
      {
        landingUrls:[ARCHIVE],
        verifyTargets:true,
        requireCityCoverage:true,
        allowGeneric:true,
        allowFeed:true
      }
    );

  return {
    ...fallback,
    diagnostics:{
      ladder:ladder.diagnostics,
      legacyAndFeedFallback:
        fallback.diagnostics
    }
  };
}

export const istinyeGanyanAdapter:ExpertAdapter={
  sourceKey:"istinye_ganyan",

  resolve:
    context=>
      context.raceDate<turkeyDate()
        ? resolveHistorical(context)
        : resolveDirectAdapter(context),

  ownsAcquisition:
    ownsHistorical,

  acquireHtml:
    context=>
      acquireResilientArticleHtml(
        context,
        {
          readySelector:
            ARTICLE_READY
        }
      )
};
