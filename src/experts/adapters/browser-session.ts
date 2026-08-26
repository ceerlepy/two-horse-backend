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


function escapeRegex(
  value:
    string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
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


async function launchBrowser(
  context:
    ExpertAcquireContext
) {
  return puppeteer.launch(
    context.env.BROWSER as any
  );
}


async function bodyText(
  page:
    any
): Promise<string> {
  return String(
    await page.evaluate(
      () =>
        document.body
          ?.innerText ??
        ""
    )
  );
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


async function activateCity(
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
              .replace(/[^A-Z0-9]+/g," ")
              .replace(/\s+/g," ")
              .trim();


        const target =
          fold(
            wantedCity
          );


        /*
         * First preference: actual city <select>.
         */
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
            method:
              "select",

            text:
              option.textContent
          });
        }


        /*
         * AFA may expose city as a tab/button/card.
         */
        const clickables =
          Array.from(
            document.querySelectorAll(
              [
                "button",
                "a",
                "[role='button']",
                "[role='tab']",
                "label",
                "li"
              ].join(",")
            )
          ) as HTMLElement[];


        const clickable =
          clickables.find(
            node =>
              fold(
                node.innerText ??
                node.textContent
              ) ===
                target
          );


        if (clickable) {
          clickable.click();


          return JSON.stringify({
            ok:true,
            method:
              "click",

            text:
              clickable.innerText ??
              clickable.textContent
          });
        }


        return JSON.stringify({
          ok:false,
          method:null
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


function wrapDocument(
  source:
    string,

  raceDate:
    string,

  city:
    string,

  text:
    string
): string {
  const payload =
    [
      `TWOHORSE SOURCE: ${source}`,
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


/*
 * Real public Ganyan format:
 *
 *   kullanıcı tarafından 8. koşuda (4)AT ADI için yazıldı
 *
 * The "." after race number is required source syntax and was
 * exactly what the previous parser missed.
 */
export function extractGanyanCommentsSection(
  text:
    string,

  city:
    string
): string | null {
  const cityHeading =
    new RegExp(
      `${escapeRegex(city)}\\s+En\\s+Son\\s+Yorumlar`,
      "iu"
    );


  const heading =
    cityHeading.exec(
      text
    );


  if (
    !heading ||
    heading.index ===
      undefined
  ) {
    return null;
  }


  const tail =
    text.slice(
      heading.index
    );


  let end =
    tail.length;


  for (
    const marker of
    [
      /Tüm\s+Yorumları\s+Gör/iu,
      /Takı\s+Değişiklikleri/iu,
      /Şehir\s+Değişiklikleri/iu
    ]
  ) {
    const hit =
      marker.exec(
        tail
      );


    if (
      hit &&
      hit.index <
        end
    ) {
      end =
        hit.index;
    }
  }


  const section =
    tail.slice(
      0,
      end
    )
      .trim();


  const identity =
    /tarafından\s+\d{1,2}\s*\.\s*koşuda\s*\(\s*\d+\s*\)/iu;


  return identity.test(
    section
  )
    ? section
    : null;
}


async function findAfaCityDocument(
  page:
    any,

  city:
    string,

  activationOk:
    boolean
): Promise<string> {
  return String(
    await page.evaluate(
      (
        wantedCity:
          string,

        wasActivated:
          boolean
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
              .replace(/[^A-Z0-9]+/g," ")
              .replace(/\s+/g," ")
              .trim();


        const cityKey =
          fold(
            wantedCity
          );


        const semanticKeys =
          [
            "AFA",
            "ANALIZ",
            "BULTEN",
            "FAVORI",
            "RAKIP",
            "SURPRIZ",
            "BANKO",
            "TEK"
          ];


        const nodes =
          Array.from(
            document.querySelectorAll(
              [
                "article",
                "section",
                "main",
                "[role='main']",
                "[class*='analiz']",
                "[class*='analysis']",
                "[class*='bulten']",
                "[class*='bulletin']",
                "[class*='terminal']",
                "[class*='content']",
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
                      /\u00a0/g,
                      " "
                    )
                    .replace(
                      /\n{3,}/g,
                      "\n\n"
                    )
                    .trim();


                if (
                  text.length <
                    350 ||
                  text.length >
                    42000
                ) {
                  return null;
                }


                const normalized =
                  fold(
                    text
                  );


                const cityHit =
                  normalized.includes(
                    cityKey
                  );


                const semanticHits =
                  semanticKeys
                    .filter(
                      key =>
                        normalized.includes(
                          key
                        )
                    )
                    .length;


                /*
                 * fold() converts "1. Koşu" -> "1 KOSU".
                 */
                const raceHits =
                  (
                    normalized.match(
                      /\b\d{1,2}\s+KOSU\b/g
                    ) ??
                    []
                  )
                    .length;


                if (
                  (
                    !wasActivated &&
                    !cityHit
                  ) ||
                  semanticHits <
                    2 ||
                  raceHits <
                    2
                ) {
                  return null;
                }


                return {
                  text,

                  score:
                    raceHits *
                      100 +
                    semanticHits *
                      20 +
                    (
                      cityHit
                        ? 40
                        : 0
                    ) -
                    text.length /
                      2000
                };
              }
            )
            .filter(
              (
                value
              ): value is {
                text:string;
                score:number;
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
                second.score -
                first.score
            );


        return candidates[0]
          ?.text ??
          "";
      },
      city,
      activationOk
    )
  );
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
      await launchBrowser(
        context
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
      1000
    );


    let cityState:any = {
      ok:false
    };


    for (
      let attempt=0;
      attempt<20;
      attempt++
    ) {
      cityState =
        await activateCity(
          page,
          city
        );


      if (cityState.ok) {
        break;
      }


      await delay(
        350
      );
    }


    if (!cityState.ok) {
      throw new Error(
        `GANYAN_TARGET_CITY_NOT_FOUND:${city}`
      );
    }


    await delay(
      1000
    );


    let section:
      string | null =
      null;


    for (
      let attempt=0;
      attempt<15;
      attempt++
    ) {
      section =
        extractGanyanCommentsSection(
          await bodyText(
            page
          ),
          city
        );


      if (section) {
        break;
      }


      await delay(
        400
      );
    }


    if (!section) {
      throw new Error(
        `GANYAN_COMMENT_SECTION_NOT_FOUND:${city}`
      );
    }


    const html =
      wrapDocument(
        "GANYAN CANAVARI",
        context.raceDate,
        city,
        section
      );


    return {
      stage:
        "browser-session",

      html,

      requestedUrl:
        context.url,

      finalUrl:
        String(
          page.url()
        ),

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
        // Cleanup only.
      }
    }
  }
}


export async function acquireAfaBrowserSession(
  context:
    ExpertAcquireContext
): Promise<AcquiredHtml> {
  const city =
    cityFromTarget(
      context.url
    );


  if (!city) {
    throw new Error(
      "AFA_CITY_SCOPE_MISSING"
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
      await launchBrowser(
        context
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
        "AFA_TARGET_DATE_INPUT_FAILED:" +
        JSON.stringify(
          dateState
        )
      );
    }


    /*
     * Verify real page state BEFORE adding our synthetic
     * target-date header.
     */
    let renderedDate =
      false;


    for (
      let attempt=0;
      attempt<15;
      attempt++
    ) {
      const text =
        await bodyText(
          page
        );


      const normalized =
        normalizeExpertSearchText(
          text
        );


      renderedDate =
        normalized.includes(
          normalizeExpertSearchText(
            ddmmyyyy(
              context.raceDate
            )
          )
        ) ||
        normalized.includes(
          normalizeExpertSearchText(
            context.raceDate
          )
        );


      if (renderedDate) {
        break;
      }


      await delay(
        400
      );
    }


    if (!renderedDate) {
      throw new Error(
        "AFA_BROWSER_TARGET_DATE_NOT_RENDERED"
      );
    }


    /*
     * Select city if the application exposes city controls.
     *
     * If the application renders all city bulletin blocks
     * simultaneously, findAfaCityDocument isolates the block
     * containing the requested city instead.
     */
    let cityState:any = {
      ok:false
    };


    for (
      let attempt=0;
      attempt<12;
      attempt++
    ) {
      cityState =
        await activateCity(
          page,
          city
        );


      if (cityState.ok) {
        break;
      }


      await delay(
        250
      );
    }


    if (cityState.ok) {
      await delay(
        700
      );
    }


    let documentText =
      "";


    for (
      let attempt=0;
      attempt<15;
      attempt++
    ) {
      documentText =
        await findAfaCityDocument(
          page,
          city,
          Boolean(
            cityState.ok
          )
        );


      if (
        documentText.length >=
          350
      ) {
        break;
      }


      await delay(
        350
      );
    }


    if (
      documentText.length <
        350
    ) {
      throw new Error(
        "AFA_CITY_BULLETIN_NOT_FOUND:" +
        JSON.stringify({
          city,

          activation:
            cityState
        })
      );
    }


    /*
     * Exactly ONE city document.
     *
     * No loop over race buttons.
     * No repeated whole-page snapshots.
     */
    const html =
      wrapDocument(
        "AFA",
        context.raceDate,
        city,
        documentText
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
        // Cleanup only.
      }
    }
  }
}
