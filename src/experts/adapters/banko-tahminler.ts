import {
  acquireResilientArticleHtml,
  resolveResilientArticleTargets
} from "./resilient-article";

import type {
  ExpertAdapter
} from "./types";


const CATEGORY =
  "https://www.bankotahminler.com/kategori/tahminler/";

const LIST_READY =
  'a[href*="/tahminler/"]:not([href*="/kategori/"])';

const ARTICLE_READY =
  "article,main,.entry-content,.post-content,[role='main'],h1";


function ownsArticle(
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
        "bankotahminler.com" &&
      path.startsWith(
        "/tahminler/"
      ) &&
      !path.includes(
        "/ai-tahmin/"
      ) &&
      !path.startsWith(
        "/kategori/"
      )
    );

  } catch {
    return false;
  }
}


export const bankoTahminlerAdapter:
  ExpertAdapter = {
    sourceKey:
      "banko_tahminler",

    resolve(context) {
      return resolveResilientArticleTargets(
        context,
        {
          landingUrls:[
            CATEGORY
          ],

          readySelector:
            LIST_READY,

          maxPages:4,

          urlPredicate:
            ownsArticle
        }
      );
    },

    ownsAcquisition:
      ownsArticle,

    acquireHtml(context) {
      return acquireResilientArticleHtml(
        context,
        {
          readySelector:
            ARTICLE_READY
        }
      );
    }
  };
