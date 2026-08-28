import {
  load
} from "cheerio";

import {
  EXPERT_ACQUISITION_CONFIG
} from "../config/expert-acquisition";


export interface ExpertArticleText {
  text:string;
  selectedRoot:string;
  originalCharacters:number;
  outputCharacters:number;
  truncated:boolean;
}


function cleanText(
  value:unknown
):string {
  return String(
    value ??
    ""
  )
    .replace(/\u00a0/g," ")
    .replace(/[ \t\r]+/g," ")
    .replace(/ *\n */g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}


function structuralText(
  $:any,
  selector:string
):string {
  let best="";

  $(selector).each(
    (
      _index:number,
      element:any
    ) => {
      const root =
        $(element)
          .clone();

      root
        .find("br")
        .replaceWith("\n");

      root
        .find(
          [
            "p",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "li",
            "tr",
            "section",
            "article"
          ].join(",")
        )
        .each(
          (
            _i:number,
            node:any
          ) => {
            $(node)
              .append("\n");
          }
        );

      root
        .find("td,th")
        .each(
          (
            _i:number,
            node:any
          ) => {
            $(node)
              .append(" ");
          }
        );

      const text =
        cleanText(
          root.text()
        );

      if (
        text.length >
        best.length
      ) {
        best=text;
      }
    }
  );

  return best;
}


export function expertArticleTextFromHtml(
  html:string
):ExpertArticleText {
  const $ =
    load(html);

  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "iframe",
      "nav",
      "footer",
      "form"
    ].join(",")
  ).remove();

  const roots = [
    "article",
    "main",
    "[role='main']",
    "body"
  ];

  let selectedRoot =
    "body";

  let text="";

  for (
    const selector of
    roots
  ) {
    const candidate =
      structuralText(
        $,
        selector
      );

    if (
      candidate.length >=
      500
    ) {
      selectedRoot=
        selector;

      text=
        candidate;

      break;
    }

    if (
      candidate.length >
      text.length
    ) {
      selectedRoot=
        selector;

      text=
        candidate;
    }
  }

  const originalCharacters =
    text.length;

  const maximum =
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .sourceHardSafetyCharacters;

  let truncated=false;

  if (
    text.length >
    maximum
  ) {
    truncated=true;

    const head =
      Math.floor(
        maximum *
        0.72
      );

    text=[
      text.slice(
        0,
        head
      ),

      "",
      "[SOURCE HARD SAFETY CUT]",
      "",

      text.slice(
        -(maximum-head)
      )
    ].join("\n");
  }

  return {
    text,
    selectedRoot,
    originalCharacters,

    outputCharacters:
      text.length,

    truncated
  };
}
