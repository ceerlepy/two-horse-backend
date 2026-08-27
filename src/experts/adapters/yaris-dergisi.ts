import { resolveArticleAdapter } from "./common";
import { acquireResilientArticleHtml, resolveResilientArticleTargets } from "./resilient-article";
import type { ExpertAdapter, ExpertAdapterContext, ExpertTargetResolution } from "./types";

const TAG="https://www.yarisdergisi.com/tag/yaris-tahminleri/";
const LIST_READY="article a[href],.post a[href],.entry a[href],h2 a[href],h3 a[href]";
const ARTICLE_READY="article,main,.entry-content,.post-content,[role='main'],h1";

function ownsArticle(value:string) {
  try {
    const u=new URL(value);
    const host=u.hostname.replace(/^www\./,"").toLowerCase();
    const path=u.pathname.toLowerCase();

    return (
      host==="yarisdergisi.com" &&
      path!=="/" &&
      !path.startsWith("/tag/") &&
      !path.startsWith("/category/")
    );
  } catch {
    return false;
  }
}

async function resolveYD(
  context:ExpertAdapterContext
):Promise<ExpertTargetResolution> {
  const ladder=
    await resolveResilientArticleTargets(
      context,
      {
        landingUrls:[TAG],
        readySelector:LIST_READY,
        maxPages:4,
        urlPredicate:ownsArticle
      }
    );

  if (ladder.status==="ready")
    return ladder;

  const fallback=
    await resolveArticleAdapter(
      context,
      {
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

export const yarisDergisiAdapter:ExpertAdapter={
  sourceKey:"yaris_dergisi",
  resolve:resolveYD,
  ownsAcquisition:ownsArticle,
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
