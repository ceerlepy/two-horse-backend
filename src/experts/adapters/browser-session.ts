import puppeteer from "@cloudflare/puppeteer";

import type {
  AcquiredHtml
} from "../../acquisition/types";

import type {
  ExpertAcquireContext
} from "./types";

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


async function launchBrowser(
  context:
    ExpertAcquireContext
) {
  return puppeteer.launch(
    context.env.BROWSER as any
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
    String(raw)
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
              string
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
                    item.textContent ??
                    ""
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
            value:
              option.value,
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
    String(raw)
  );
}


async function raceClickTexts(
  page:
    any
): Promise<string[]> {
  const raw =
    await page.evaluate(
      () => {
        const nodes =
          Array.from(
            document.querySelectorAll(
              [
                "button",
                "a",
                "[role='button']",
                "[onclick]",
                "li"
              ].join(",")
            )
          ) as HTMLElement[];


        const values =
          nodes
            .map(
              node =>
                String(
                  node.innerText ??
                  node.textContent ??
                  ""
                )
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim()
            )
            .filter(
              text =>
                text.length >
                  0 &&
                text.length <
                  140
            )
            .filter(
              text => {
                const normalized =
                  text
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
                    .replace(/Ç/g,"C");


                return (
                  /\b\d+\s*\.\s*KOSU\b/
                    .test(
                      normalized
                    ) ||
                  /\bKOSU\s*\d+\b/
                    .test(
                      normalized
                    )
                );
              }
            );


        return JSON.stringify(
          [
            ...new Set(
              values
            )
          ]
        );
      }
    );


  const parsed =
    JSON.parse(
      String(raw)
    );


  return Array.isArray(
    parsed
  )
    ? parsed.map(String)
    : [];
}


async function clickText(
  page:
    any,

  wanted:
    string
): Promise<boolean> {
  return Boolean(
    await page.evaluate(
      (
        text:
          string
      ) => {
        const clean =
          (
            value:
              string
          ) =>
            String(
              value ??
              ""
            )
              .replace(
                /\s+/g,
                " "
              )
              .trim();


        const target =
          clean(
            text
          );


        const nodes =
          Array.from(
            document.querySelectorAll(
              [
                "button",
                "a",
                "[role='button']",
                "[onclick]",
                "li"
              ].join(",")
            )
          ) as HTMLElement[];


        const found =
          nodes.find(
            node =>
              clean(
                node.innerText ??
                node.textContent ??
                ""
              ) ===
                target
          );


        if (!found) {
          return false;
        }


        found.click();

        return true;
      },
      wanted
    )
  );
}


function wrapSnapshots(
  snapshots:
    string[]
): string {
  const combined =
    snapshots
      .map(
        (
          snapshot,
          index
        ) =>
          [
            `===== SNAPSHOT ${index+1} =====`,
            snapshot
          ].join("\n")
      )
      .join("\n\n");


  return [
    "<html>",
    "<body>",
    "<pre>",
    htmlEscape(
      combined
    ),
    "</pre>",
    "</body>",
    "</html>"
  ].join("");
}


export async function acquireGanyanBrowserSession(
  context:
    ExpertAcquireContext
): Promise<AcquiredHtml> {
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
      context.url,
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


    const snapshots:
      string[] = [];

    const missingCities:
      string[] = [];


    for (
      const city of
      context.cities
    ) {
      let selected:any =
        null;


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


        if (selected.ok) {
          break;
        }


        await delay(
          400
        );
      }


      if (!selected?.ok) {
        missingCities.push(
          city
        );

        continue;
      }


      await delay(
        1200
      );


      const text =
        await bodyText(
          page
        );


      const normalized =
        normalizeExpertSearchText(
          text
        );


      const cityHit =
        normalized.includes(
          normalizeExpertSearchText(
            city
          )
        );


      const racingHit =
        [
          "tahmin",
          "galop",
          "yorum",
          "favori",
          "banko",
          "koşu"
        ]
          .map(
            normalizeExpertSearchText
          )
          .some(
            term =>
              normalized.includes(
                term
              )
          );


      if (
        cityHit &&
        racingHit
      ) {
        snapshots.push(
          [
            `SELECTED CITY: ${city}`,
            `REQUESTED DATE: ${context.raceDate}`,
            text
          ].join("\n")
        );

      } else {
        missingCities.push(
          city
        );
      }
    }


    if (
      snapshots.length !==
        context.cities.length ||
      missingCities.length
    ) {
      throw new Error(
        "GANYAN_BROWSER_CITY_COVERAGE_INCOMPLETE:" +
        JSON.stringify({
          missingCities,
          captured:
            snapshots.length
        })
      );
    }


    const html =
      wrapSnapshots(
        snapshots
      );


    return {
      stage:
        "browser-session",

      html,

      requestedUrl:
        context.url,

      finalUrl:
        context.url,

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
        // close failure is non-fatal
      }
    }
  }
}


export async function acquireAfaBrowserSession(
  context:
    ExpertAcquireContext
): Promise<AcquiredHtml> {
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
      context.url,
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


    await delay(
      1500
    );


    const initial =
      await bodyText(
        page
      );


    /*
     * Do not manufacture historical date evidence.
     * The rendered SPA itself must show requested date.
     */
    const renderedDateHit =
      normalizeExpertSearchText(
        initial
      ).includes(
        normalizeExpertSearchText(
          ddmmyyyy(
            context.raceDate
          )
        )
      );


    if (!renderedDateHit) {
      throw new Error(
        "AFA_BROWSER_TARGET_DATE_NOT_RENDERED"
      );
    }


    let clickable:
      string[] = [];


    for (
      let attempt=0;
      attempt<20;
      attempt++
    ) {
      clickable =
        (
          await raceClickTexts(
            page
          )
        )
          .slice(
            0,
            40
          );


      if (
        clickable.length
      ) {
        break;
      }


      await delay(
        400
      );
    }


    if (!clickable.length) {
      throw new Error(
        "AFA_BROWSER_NO_RACE_CONTROLS"
      );
    }


    const snapshots =
      new Set<string>();


    snapshots.add(
      initial
    );


    for (
      const text of
      clickable
    ) {
      const clicked =
        await clickText(
          page,
          text
        );


      if (!clicked) {
        continue;
      }


      await delay(
        500
      );


      const snapshot =
        await bodyText(
          page
        );


      if (
        snapshot.length >
          200
      ) {
        snapshots.add(
          snapshot
        );
      }
    }


    const combined =
      [
        ...snapshots
      ];


    const normalized =
      normalizeExpertSearchText(
        combined.join("\n")
      );


    const cityHits =
      context.cities.filter(
        city =>
          normalized.includes(
            normalizeExpertSearchText(
              city
            )
          )
      );


    if (
      combined.length <
        2 ||
      !cityHits.length
    ) {
      throw new Error(
        "AFA_BROWSER_RACE_CARD_COVERAGE_INCOMPLETE:" +
        JSON.stringify({
          controls:
            clickable.length,

          snapshots:
            combined.length,

          cityHits
        })
      );
    }


    const html =
      wrapSnapshots(
        combined
      );


    return {
      stage:
        "browser-session",

      html,

      requestedUrl:
        context.url,

      finalUrl:
        context.url,

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
        // close failure is non-fatal
      }
    }
  }
}
