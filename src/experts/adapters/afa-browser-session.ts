import puppeteer from "@cloudflare/puppeteer";

import type { AcquiredHtml } from "../../acquisition/types";
import type { ExpertAcquireContext } from "./types";

import {
  cityFromTarget,
  externalTargetUrl
} from "./target-scope";

import {
  normalizeExpertSearchText
} from "../text-normalization";


const CLICKABLE =
  "button,a,[role='button'],[role='tab'],li,[onclick]";


function delay(ms:number) {
  return new Promise<void>(
    resolve =>
      setTimeout(resolve,ms)
  );
}


function fold(value:unknown) {
  return normalizeExpertSearchText(value);
}


function escapeHtml(value:string) {
  return value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;");
}


function displayDate(iso:string) {
  const [year,month,day] =
    iso.split("-");

  return `${day}.${month}.${year}`;
}


async function bodyText(page:any) {
  return String(
    await page.evaluate(
      () =>
        document.body?.innerText ?? ""
    )
  );
}


async function setDate(
  page:any,
  raceDate:string
) {
  const state =
    await page.evaluate(
      (
        iso:string,
        display:string
      ) => {
        const inputs =
          Array.from(
            document.querySelectorAll("input")
          ) as HTMLInputElement[];

        const input =
          inputs.find(x => x.type === "date") ??
          inputs.find(
            x =>
              /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/
                .test(String(x.value ?? ""))
          );

        if (!input) {
          return {
            ok:false,
            reason:"DATE_INPUT_NOT_FOUND"
          };
        }

        const wanted =
          input.type === "date"
            ? iso
            : display;

        const descriptor =
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          );

        if (descriptor?.set) {
          descriptor.set.call(input,wanted);
        } else {
          input.value=wanted;
        }

        input.dispatchEvent(
          new Event("input",{bubbles:true})
        );
        input.dispatchEvent(
          new Event("change",{bubbles:true})
        );
        input.blur();

        return {
          ok:input.value === wanted,
          current:input.value,
          wanted
        };
      },
      raceDate,
      displayDate(raceDate)
    );

  if (!state.ok) {
    throw new Error(
      "AFA_TARGET_DATE_INPUT_FAILED:" +
      JSON.stringify(state)
    );
  }
}


async function activateCity(
  page:any,
  city:string
) {
  return page.evaluate(
    (
      wantedCity:string,
      clickableSelector:string
    ) => {
      const foldLocal =
        (value:unknown) =>
          String(value ?? "")
            .normalize("NFKD")
            .toLocaleUpperCase("tr-TR")
            .replace(/\p{M}/gu,"")
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
        foldLocal(wantedCity);

      for (
        const select of
        Array.from(
          document.querySelectorAll("select")
        ) as HTMLSelectElement[]
      ) {
        const option =
          Array.from(select.options)
            .find(
              x =>
                foldLocal(x.textContent) === target
            );

        if (!option) {
          continue;
        }

        const descriptor =
          Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value"
          );

        if (descriptor?.set) {
          descriptor.set.call(
            select,
            option.value
          );
        } else {
          select.value=option.value;
        }

        select.dispatchEvent(
          new Event("input",{bubbles:true})
        );
        select.dispatchEvent(
          new Event("change",{bubbles:true})
        );

        return {
          ok:true,
          method:"select"
        };
      }

      const nodes =
        Array.from(
          document.querySelectorAll(
            clickableSelector
          )
        ) as HTMLElement[];

      const node =
        nodes.find(
          element => {
            const visible =
              Boolean(
                element.offsetWidth ||
                element.offsetHeight ||
                element.getClientRects().length
              );

            return (
              visible &&
              foldLocal(
                element.innerText ??
                element.textContent
              ) === target
            );
          }
        );

      if (!node) {
        return {
          ok:false,
          method:null
        };
      }

      node.click();

      return {
        ok:true,
        method:"click"
      };
    },
    city,
    CLICKABLE
  );
}


async function getRaceNumbers(
  page:any
): Promise<number[]> {
  return page.evaluate(
    (
      clickableSelector:string
    ) => {
      const foldLocal =
        (value:unknown) =>
          String(value ?? "")
            .normalize("NFKD")
            .toLocaleUpperCase("tr-TR")
            .replace(/\p{M}/gu,"")
            .replace(/[İIıi]/g,"I")
            .replace(/Ğ/g,"G")
            .replace(/Ü/g,"U")
            .replace(/Ş/g,"S")
            .replace(/Ö/g,"O")
            .replace(/Ç/g,"C")
            .replace(/[^A-Z0-9]+/g," ")
            .replace(/\s+/g," ")
            .trim();

      const values =
        new Set<number>();

      for (
        const element of
        Array.from(
          document.querySelectorAll(
            clickableSelector
          )
        ) as HTMLElement[]
      ) {
        const visible =
          Boolean(
            element.offsetWidth ||
            element.offsetHeight ||
            element.getClientRects().length
          );

        if (!visible) {
          continue;
        }

        const match =
          foldLocal(
            element.innerText ??
            element.textContent
          )
            .match(
              /^(\d{1,2})\s+KOSU(?:\s|$)/
            );

        if (!match) {
          continue;
        }

        const value =
          Number(match[1]);

        if (
          Number.isInteger(value) &&
          value > 0 &&
          value <= 30
        ) {
          values.add(value);
        }
      }

      return [...values]
        .sort((a,b) => a-b);
    },
    CLICKABLE
  );
}


async function clickRace(
  page:any,
  raceNumber:number
) {
  return page.evaluate(
    (
      wantedRace:number,
      clickableSelector:string
    ) => {
      const foldLocal =
        (value:unknown) =>
          String(value ?? "")
            .normalize("NFKD")
            .toLocaleUpperCase("tr-TR")
            .replace(/\p{M}/gu,"")
            .replace(/[İIıi]/g,"I")
            .replace(/Ğ/g,"G")
            .replace(/Ü/g,"U")
            .replace(/Ş/g,"S")
            .replace(/Ö/g,"O")
            .replace(/Ç/g,"C")
            .replace(/[^A-Z0-9]+/g," ")
            .replace(/\s+/g," ")
            .trim();

      const expected =
        `${wantedRace} KOSU`;

      const node =
        (
          Array.from(
            document.querySelectorAll(
              clickableSelector
            )
          ) as HTMLElement[]
        )
          .find(
            element => {
              const visible =
                Boolean(
                  element.offsetWidth ||
                  element.offsetHeight ||
                  element.getClientRects().length
                );

              if (!visible) {
                return false;
              }

              const text =
                foldLocal(
                  element.innerText ??
                  element.textContent
                );

              return (
                text === expected ||
                text.startsWith(
                  `${expected} `
                )
              );
            }
          );

      if (!node) {
        return false;
      }

      node.click();
      return true;
    },
    raceNumber,
    CLICKABLE
  );
}


function changedLines(
  before:string,
  after:string
) {
  const beforeSet =
    new Set(
      before
        .split(/\n+/)
        .map(x => x.trim())
        .filter(Boolean)
    );

  return after
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean)
    .filter(
      line =>
        !beforeSet.has(line)
    )
    .join("\n")
    .trim();
}


function usefulPanel(
  value:string
) {
  const material =
    fold(value);

  const semanticHits =
    [
      "afa",
      "analiz",
      "favori",
      "rakip",
      "surpriz",
      "banko",
      "tek",
      "olasilik",
      "pedigri",
      "tempo"
    ]
      .filter(
        term =>
          material.includes(term)
      )
      .length;

  return (
    value.length >= 120 &&
    semanticHits >= 1
  );
}


async function fallbackPanel(
  page:any,
  raceNumber:number
) {
  return String(
    await page.evaluate(
      (
        wantedRace:number
      ) => {
        const clean =
          (value:unknown) =>
            String(value ?? "")
              .replace(/\u00a0/g," ")
              .replace(/\n{3,}/g,"\n\n")
              .trim();

        const foldLocal =
          (value:unknown) =>
            clean(value)
              .normalize("NFKD")
              .toLocaleUpperCase("tr-TR")
              .replace(/\p{M}/gu,"")
              .replace(/[İIıi]/g,"I")
              .replace(/Ğ/g,"G")
              .replace(/Ü/g,"U")
              .replace(/Ş/g,"S")
              .replace(/Ö/g,"O")
              .replace(/Ç/g,"C")
              .replace(/[^A-Z0-9]+/g," ")
              .replace(/\s+/g," ")
              .trim();

        const expected =
          `${wantedRace} KOSU`;

        const nodes =
          Array.from(
            document.querySelectorAll(
              [
                "[role='tabpanel']",
                "article",
                "section",
                "[class*='analysis']",
                "[class*='analiz']",
                "[class*='detail']",
                "[class*='panel']",
                "[class*='content']",
                "main",
                "div"
              ].join(",")
            )
          ) as HTMLElement[];

        const candidates =
          nodes
            .map(
              node => {
                const visible =
                  Boolean(
                    node.offsetWidth ||
                    node.offsetHeight ||
                    node.getClientRects().length
                  );

                if (!visible) {
                  return null;
                }

                const text =
                  clean(
                    node.innerText ??
                    node.textContent
                  );

                if (
                  text.length < 120 ||
                  text.length > 10000
                ) {
                  return null;
                }

                const normalized =
                  foldLocal(text);

                const races =
                  new Set(
                    [...normalized.matchAll(
                      /\b(\d{1,2})\s+KOSU\b/g
                    )]
                      .map(x => Number(x[1]))
                  );

                if (races.size > 2) {
                  return null;
                }

                const semantics =
                  [
                    "AFA",
                    "ANALIZ",
                    "FAVORI",
                    "RAKIP",
                    "SURPRIZ",
                    "BANKO",
                    "TEK",
                    "OLASILIK",
                    "PEDIGRI",
                    "TEMPO"
                  ]
                    .filter(
                      key =>
                        normalized.includes(key)
                    )
                    .length;

                if (semantics < 2) {
                  return null;
                }

                return {
                  text,
                  score:
                    (
                      normalized.includes(expected)
                        ? 1000
                        : 0
                    ) +
                    semantics * 50 -
                    text.length / 100
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
                Boolean(value)
            )
            .sort(
              (a,b) =>
                b.score-a.score
            );

        return candidates[0]?.text ?? "";
      },
      raceNumber
    )
  );
}


function wrapDocument(
  raceDate:string,
  city:string,
  panels:Array<{
    raceNumber:number;
    text:string;
  }>
) {
  const payload =
    [
      "TWOHORSE SOURCE: AFA",
      `TWOHORSE TARGET DATE: ${raceDate}`,
      `TWOHORSE TARGET CITY: ${city}`,
      "",
      ...panels.flatMap(
        panel => [
          `AFA_RACE_CONTEXT|CITY=${city}|RACE=${panel.raceNumber}`,
          panel.text,
          "AFA_RACE_CONTEXT_END",
          ""
        ]
      )
    ]
      .join("\n");

  return (
    "<html><body><article><pre>" +
    escapeHtml(payload) +
    "</pre></article></body></html>"
  );
}


export async function acquireAfaBrowserSession(
  context:
    ExpertAcquireContext
): Promise<AcquiredHtml> {
  const city =
    cityFromTarget(context.url);

  if (!city) {
    throw new Error(
      "AFA_CITY_SCOPE_MISSING"
    );
  }

  const targetUrl =
    externalTargetUrl(context.url);

  let browser:any=null;

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
        waitUntil:"networkidle2",
        timeout:30_000
      }
    );

    await setDate(
      page,
      context.raceDate
    );

    for (
      let attempt=0;
      attempt<15;
      attempt++
    ) {
      const text =
        await bodyText(page);

      if (
        fold(text).includes(
          fold(context.raceDate)
        ) ||
        fold(text).includes(
          fold(
            displayDate(
              context.raceDate
            )
          )
        )
      ) {
        break;
      }

      if (attempt === 14) {
        throw new Error(
          "AFA_BROWSER_TARGET_DATE_NOT_RENDERED"
        );
      }

      await delay(350);
    }

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

      await delay(250);
    }

    if (!cityState.ok) {
      throw new Error(
        `AFA_TARGET_CITY_NOT_FOUND:${city}`
      );
    }

    await delay(700);

    const races =
      await getRaceNumbers(page);

    if (!races.length) {
      throw new Error(
        `AFA_RACE_CONTROLS_NOT_FOUND:${city}`
      );
    }

    /*
     * Force a different initial selected race so R1 can also
     * be extracted through a real before/after DOM change.
     */
    await clickRace(
      page,
      races[races.length-1]
    );
    await delay(400);

    const panels:
      Array<{
        raceNumber:number;
        text:string;
      }> = [];

    const fingerprints =
      new Map<string,number>();

    for (
      const raceNumber of races
    ) {
      const before =
        await bodyText(page);

      const clicked =
        await clickRace(
          page,
          raceNumber
        );

      if (!clicked) {
        throw new Error(
          `AFA_RACE_CLICK_FAILED:${city}:R${raceNumber}`
        );
      }

      let panel="";

      for (
        let attempt=0;
        attempt<15;
        attempt++
      ) {
        await delay(
          attempt === 0
            ? 450
            : 250
        );

        const after =
          await bodyText(page);

        const diff =
          changedLines(
            before,
            after
          );

        if (usefulPanel(diff)) {
          panel=diff;
          break;
        }

        const fallback =
          await fallbackPanel(
            page,
            raceNumber
          );

        if (usefulPanel(fallback)) {
          panel=fallback;
          break;
        }
      }

      if (!panel) {
        throw new Error(
          `AFA_RACE_PANEL_NOT_FOUND:${city}:R${raceNumber}`
        );
      }

      const fingerprint =
        fold(panel);

      const duplicateRace =
        fingerprints.get(fingerprint);

      if (
        duplicateRace !== undefined &&
        duplicateRace !== raceNumber
      ) {
        throw new Error(
          "AFA_DUPLICATE_RACE_PANEL:" +
          JSON.stringify({
            city,
            raceNumber,
            duplicateRace
          })
        );
      }

      fingerprints.set(
        fingerprint,
        raceNumber
      );

      panels.push({
        raceNumber,
        text:panel
      });
    }

    if (
      panels.length !== races.length
    ) {
      throw new Error(
        "AFA_RACE_PANEL_INCOMPLETE"
      );
    }

    const html =
      wrapDocument(
        context.raceDate,
        city,
        panels
      );

    return {
      stage:"browser-session",
      html,
      requestedUrl:context.url,
      finalUrl:targetUrl,
      status:200,
      contentType:"text/html",
      bodyLength:html.length
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
