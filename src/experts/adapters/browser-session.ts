import puppeteer
  from "@cloudflare/puppeteer";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import type {
  ExpertAcquireContext
} from "./types";

import {
  cityFromTarget,
  externalTargetUrl
} from "./target-scope";

import {
  normalizeExpertSearchText
} from "../text-normalization";


function delay(
  milliseconds:
    number
): Promise<void> {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


function htmlEscape(
  value:
    string
): string {
  return value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}


function ddmmyyyy(
  iso:
    string
): string {
  const [
    year,
    month,
    day
  ] =
    iso.split("-");


  return [
    day,
    month,
    year
  ].join(".");
}


async function setDateInput(
  page:
    any,

  raceDate:
    string
) {
  const raw =
    await page.evaluate(
      (
        iso:
          string,

        display:
          string
      ) => {
        const inputs =
          Array.from(
            document.querySelectorAll(
              "input"
            )
          ) as HTMLInputElement[];


        const input =
          inputs.find(
            item =>
              item.type ===
                "date"
          ) ??
          inputs.find(
            item =>
              /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/
                .test(
                  String(
                    item.value ??
                    ""
                  )
                )
          );


        if (!input) {
          return JSON.stringify({
            ok:false,
            reason:
              "DATE_INPUT_NOT_FOUND"
          });
        }


        const wanted =
          input.type ===
            "date"
            ? iso
            : display;


        const descriptor =
          Object
            .getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value"
            );


        if (descriptor?.set) {
          descriptor.set.call(
            input,
            wanted
          );

        } else {
          input.value =
            wanted;
        }


        input.dispatchEvent(
          new Event(
            "input",
            {
              bubbles:true
            }
          )
        );

        input.dispatchEvent(
          new Event(
            "change",
            {
              bubbles:true
            }
          )
        );

        input.blur();


        return JSON.stringify({
          ok:
            input.value ===
            wanted,

          type:
            input.type,

          wanted,

          current:
            input.value
        });
      },
      raceDate,
      ddmmyyyy(
        raceDate
      )
    );


  return JSON.parse(
    String(
      raw
    )
  );
}


async function selectCity(
  page:
    any,

  city:
    string
) {
  const raw =
    await page.evaluate(
      (
        wantedCity:
          string
      ) => {
        const fold =
          (
            value:
              unknown
          ) =>
            String(
              value ??
              ""
            )
              .normalize(
                "NFKC"
              )
              .toLocaleUpperCase(
                "tr-TR"
              )
              .replace(/[İIıi]/g,"I")
              .replace(/Ğ/g,"G")
              .replace(/Ü/g,"U")
              .replace(/Ş/g,"S")
              .replace(/Ö/g,"O")
              .replace(/Ç/g,"C")
              .replace(/\s+/g," ")
              .trim();


        const target =
          fold(
            wantedCity
          );


        const selects =
          Array.from(
            document.querySelectorAll(
              "select"
            )
          ) as HTMLSelectElement[];


        for (
          const select of
          selects
        ) {
          const option =
            Array
              .from(
                select.options
              )
              .find(
                item =>
                  fold(
                    item.textContent
                  ) ===
                    target
              );


          if (!option) {
            continue;
          }


          const descriptor =
            Object
              .getOwnPropertyDescriptor(
                HTMLSelectElement.prototype,
                "value"
              );


          if (descriptor?.set) {
            descriptor.set.call(
              select,
              option.value
            );

          } else {
            select.value =
              option.value;
          }


          select.dispatchEvent(
            new Event(
              "input",
              {
                bubbles:true
              }
            )
          );

          select.dispatchEvent(
            new Event(
              "change",
              {
                bubbles:true
              }
            )
          );


          return JSON.stringify({
            ok:true,
            text:
              option.textContent
          });
        }


        return JSON.stringify({
          ok:false
        });
      },
      city
    );


  return JSON.parse(
    String(
      raw
    )
  );
}


async function commentsSection(
  page:
    any,

  city:
    string
): Promise<string> {
  return String(
    await page.evaluate(
      (
        wantedCity:
          string
      ) => {
        const fold =
          (
            value:
              unknown
          ) =>
            String(
              value ??
              ""
            )
              .normalize(
                "NFKC"
              )
              .toLocaleUpperCase(
                "tr-TR"
              )
              .replace(/[İIıi]/g,"I")
              .replace(/Ğ/g,"G")
              .replace(/Ü/g,"U")
              .replace(/Ş/g,"S")
              .replace(/Ö/g,"O")
              .replace(/Ç/g,"C")
              .replace(/\s+/g," ")
              .trim();


        const cityText =
          fold(
            wantedCity
          );


        const nodes =
          Array.from(
            document.querySelectorAll(
              [
                "section",
                "article",
                "main",
                "div"
              ].join(",")
            )
          ) as HTMLElement[];


        const candidates =
          nodes
            .map(
              node => {
                const text =
                  String(
                    node.innerText ??
                    node.textContent ??
                    ""
                  )
                    .replace(
                      /\s+/g,
                      " "
                    )
                    .trim();


                if (
                  text.length <
                    180 ||
                  text.length >
                    18000
                ) {
                  return null;
                }


                const normalized =
                  fold(
                    text
                  );


                const commentsHeading =
                  normalized.includes(
                    "EN SON YORUMLAR"
                  );


                const cityHit =
                  normalized.includes(
                    cityText
                  );


                const commentHits =
                  (
                    normalized.match(
                      /TARAFINDAN\s+\d+\s+KOSUDA/g
                    ) ??
                    []
                  )
                    .length;


                if (
                  !commentsHeading ||
                  !cityHit ||
                  commentHits <
                    1
                ) {
                  return null;
                }


                return {
                  text,
                  commentHits
                };
              }
            )
            .filter(
              (
                value
              ): value is {
                text:string;
                commentHits:number;
              } =>
                Boolean(
                  value
                )
            )
            .sort(
              (
                first,
                second
              ) =>
                second.commentHits -
                  first.commentHits ||
                first.text.length -
                  second.text.length
            );


        return candidates[0]
          ?.text ??
          "";
      },
      city
    )
  );
}


function wrapDocument(
  raceDate:
    string,

  city:
    string,

  text:
    string
): string {
  const payload =
    [
      "TWOHORSE SOURCE: GANYAN CANAVARI",
      `TWOHORSE TARGET DATE: ${raceDate}`,
      `TWOHORSE TARGET CITY: ${city}`,
      "",
      text
    ].join(
      "\n"
    );


  return [
    "<html>",
    "<body>",
    "<article>",
    "<pre>",
    htmlEscape(
      payload
    ),
    "</pre>",
    "</article>",
    "</body>",
    "</html>"
  ].join("");
}


export async function acquireGanyanBrowserSession(
  context:
    ExpertAcquireContext
): Promise<AcquiredHtml> {
  const city =
    cityFromTarget(
      context.url
    );


  if (!city) {
    throw new Error(
      "GANYAN_CITY_SCOPE_MISSING"
    );
  }


  const targetUrl =
    externalTargetUrl(
      context.url
    );


  let browser:any =
    null;


  try {
    browser =
      await puppeteer.launch(
        context.env.BROWSER as any
      );


    const page:any =
      await browser.newPage();


    await page.goto(
      targetUrl,
      {
        waitUntil:
          "networkidle2",

        timeout:
          30_000
      }
    );


    const dateState =
      await setDateInput(
        page,
        context.raceDate
      );


    if (!dateState.ok) {
      throw new Error(
        "GANYAN_TARGET_DATE_INPUT_FAILED:" +
        JSON.stringify(
          dateState
        )
      );
    }


    await delay(
      1200
    );


    let selected:any = {
      ok:false
    };


    for (
      let attempt=0;
      attempt<20;
      attempt++
    ) {
      selected =
        await selectCity(
          page,
          city
        );


      if (
        selected.ok
      ) {
        break;
      }


      await delay(
        350
      );
    }


    if (!selected.ok) {
      throw new Error(
        `GANYAN_TARGET_CITY_NOT_FOUND:${city}`
      );
    }


    await delay(
      1200
    );


    const text =
      await commentsSection(
        page,
        city
      );


    if (
      text.length <
        180
    ) {
      throw new Error(
        `GANYAN_COMMENT_SECTION_NOT_FOUND:${city}`
      );
    }


    const normalized =
      normalizeExpertSearchText(
        text
      );


    if (
      !normalized.includes(
        normalizeExpertSearchText(
          city
        )
      ) ||
      !normalized.includes(
        "en son yorumlar"
      )
    ) {
      throw new Error(
        `GANYAN_COMMENT_SECTION_IDENTITY_FAILED:${city}`
      );
    }


    const html =
      wrapDocument(
        context.raceDate,
        city,
        text
      );


    return {
      stage:
        "browser-session",

      html,

      requestedUrl:
        context.url,

      finalUrl:
        targetUrl,

      status:
        200,

      contentType:
        "text/html",

      bodyLength:
        html.length
    };

  } finally {
    if (browser) {
      try {
        await browser.close();

      } catch {
        // Non-fatal cleanup.
      }
    }
  }
}
