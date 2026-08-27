import { acquireGanyanGalopArticle, resolveGanyanGalopArticles } from "./ganyan-article";
import { resolveResilientArticleTargets } from "./resilient-article";
import type { ExpertAdapter, ExpertAdapterContext, ExpertTargetResolution } from "./types";

const NEWS="https://www.ganyancanavari.com.tr/haberler/";
const LIST_READY='a[href*="haber-detay"]';

function isGalopArticle(value:string) {
  try {
    const path=
      decodeURIComponent(
        new URL(value).pathname
      )
        .normalize("NFKC")
        .toLocaleLowerCase("tr-TR");

    return (
      path.includes("/haber-detay/") &&
      path.includes("galop-incelemesi")
    );
  } catch {
    return false;
  }
}

async function resolveGanyan(
  context:ExpertAdapterContext
):Promise<ExpertTargetResolution> {
  const ladder=
    await resolveResilientArticleTargets(
      context,
      {
        landingUrls:[NEWS],
        readySelector:LIST_READY,
        maxPages:2,
        urlPredicate:isGalopArticle
      }
    );

  if (ladder.status==="ready")
    return ladder;

  const fallback=
    await resolveGanyanGalopArticles(
      context
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

export const ganyanCanavariAdapter:ExpertAdapter={
  sourceKey:"ganyan_canavari",
  resolve:resolveGanyan,
  ownsAcquisition:isGalopArticle,
  acquireHtml:
    acquireGanyanGalopArticle
};
