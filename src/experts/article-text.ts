import {
  load
} from "cheerio";


export interface ExpertArticleText {
  text:
    string;

  selectedRoot:
    string;

  originalCharacters:
    number;

  outputCharacters:
    number;

  truncated:
    boolean;
}


function cleanText(
  value:
    unknown
): string {
  return String(
    value ??
    ""
  )
    .replace(
      /\u00a0/g,
      " "
    )
    .replace(
      /[\t\r ]+/g,
      " "
    )
    .replace(
      /\n\s+/g,
      "\n"
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}


export function expertArticleTextFromHtml(
  html:
    string
): ExpertArticleText {
  const $ =
    load(
      html
    );


  /*
   * Remove elements that add token cost but cannot contain
   * expert editorial analysis.
   */
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
  )
    .remove();


  const roots = [
    "article",
    "main",
    "[role='main']",
    "body"
  ];


  let selectedRoot =
    "body";


  let text =
    "";


  /*
   * Prefer semantic article/main containers when they have
   * meaningful content.
   */
  for (
    const selector of
    roots
  ) {
    const candidate =
      cleanText(
        $(
          selector
        )
          .text()
      );


    if (
      candidate.length >=
      500
    ) {
      selectedRoot =
        selector;

      text =
        candidate;

      break;
    }


    if (
      candidate.length >
      text.length
    ) {
      selectedRoot =
        selector;

      text =
        candidate;
    }
  }


  const originalCharacters =
    text.length;


  /*
   * The selected Workers AI model has a finite context
   * window.
   *
   * Normally an article/main element is far below this.
   *
   * If a source gives only a huge body, retain both ends
   * instead of blindly keeping only the beginning.
   */
  const MAX_CHARACTERS =
    48_000;


  let truncated =
    false;


  if (
    text.length >
    MAX_CHARACTERS
  ) {
    truncated =
      true;


    const head =
      text.slice(
        0,
        32_000
      );


    const tail =
      text.slice(
        -16_000
      );


    text = [
      head,
      "",
      "[ORTA SAYFA TOKEN LIMITI ICIN KISALTILDI]",
      "",
      tail
    ].join(
      "\n"
    );
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
