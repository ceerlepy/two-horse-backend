import { resolveArticleAdapter } from "./common";
import { acquireResilientArticleHtml, resolveResilientArticleTargets } from "./resilient-article";
import type { ExpertAdapter, ExpertAdapterContext, ExpertTargetResolution } from "./types";

const ROOT="https://www.bankotahminler.com/";
const MOBILE="https://www.bankotahminler.com/mobil/";
const CATEGORY="https://www.bankotahminler.com/kategori/tahminler/";
const LIST_READY='a[href*="/tahminler/"]:not([href*="/kategori/"])';
const ARTICLE_READY="article,main,.entry-content,.post-content,[role='main'],h1";

function ownsArticle(value:string) {
  try {
    const u=new URL(value);
    const host=u.hostname.replace(/^www\./,"").toLowerCase();
    const path=u.pathname.toLowerCase();

    return (
      host==="bankotahminler.com" &&
      path.startsWith("/tahminler/") &&
      !path.startsWith("/kategori/")
    );
  } catch {
    return false;
  }
}

async function resolveBanko(
  context:ExpertAdapterContext
):Promise<ExpertTargetResolution> {
  const ladder=
    await resolveResilientArticleTargets(
      context,
      {
        landingUrls:[CATEGORY],
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
        landingUrls:[
          CATEGORY,
          ROOT,
          MOBILE
        ],
        verifyTargets:true,
        requireCityCoverage:true,
        allowGeneric:true,
        allowFeed:false
      }
    );

  return {
    ...fallback,
    diagnostics:{
      ladder:ladder.diagnostics,
      legacyFallback:
        fallback.diagnostics
    }
  };
}

export const bankoTahminlerAdapter:ExpertAdapter={
  sourceKey:"banko_tahminler",
  resolve:resolveBanko,
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
