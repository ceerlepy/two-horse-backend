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
            document.querySelectorAll(
              "input"
            )
          ) as HTMLInputElement[];

        const input =
          inputs.find(
            x =>
              x.type === "date"
          ) ??
          inputs.find(
            x =>
              /^\d{1,2}[./-]\d{1,2}[./-]\d{4}$/
                .test(
                  String(
                    x.value ?? ""
                  )
                )
          );

        if (!input) {
          return {
            ok:false,
            reason:
              "DATE_INPUT_NOT_FOUND",

            inputs:
              inputs
                .slice(0,20)
                .map(
                  x => ({
                    type:x.type,
                    value:x.value
                  })
                )
          };
        }

        const wanted =
          input.type ===
            "date"
            ? iso
            : display;

        const previous =
          input.value;

        const descriptor =
          Object
            .getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value"
            );

        if (
          descriptor?.set
        ) {
          descriptor
            .set
            .call(
              input,
              wanted
            );
        } else {
          input.value =
            wanted;
        }

        const tracker =
          (
            input as
              HTMLInputElement & {
                _valueTracker?: {
                  setValue?:
                    (
                      value:string
                    ) => void;
                };
              }
          )
            ._valueTracker;

        if (
          tracker &&
          typeof tracker.setValue ===
            "function"
        ) {
          tracker.setValue(
            previous
          );
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

        input.dispatchEvent(
          new Event(
            "blur",
            {
              bubbles:true
            }
          )
        );

        return {
          ok:
            input.value ===
            wanted,

          type:
            input.type,

          previous,
          current:
            input.value,
          wanted
        };
      },

      raceDate,
      displayDate(
        raceDate
      )
    );

  if (!state.ok) {
    throw new Error(
      "AFA_TARGET_DATE_INPUT_FAILED:" +
      JSON.stringify(
        state
      )
    );
  }

  return state;
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
      const clean =
        (
          value:unknown
        ) =>
          String(
            value ?? ""
          )
            .replace(
              /\s+/g,
              " "
            )
            .trim();

      const foldLocal =
        (
          value:unknown
        ) =>
          clean(value)
            .normalize("NFKD")
            .toLocaleUpperCase(
              "tr-TR"
            )
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
        foldLocal(
          wantedCity
        );

      const cityMatch =
        (
          value:unknown
        ) => {
          const text =
            foldLocal(value);

          if (!text)
            return false;

          return (
            text === target ||
            (
              text.length <=
                target.length + 40 &&
              (
                text.startsWith(
                  `${target} `
                ) ||
                text.endsWith(
                  ` ${target}`
                ) ||
                (
                  ` ${text} `
                ).includes(
                  ` ${target} `
                )
              )
            )
          );
        };


      for (
        const select of
        Array.from(
          document.querySelectorAll(
            "select"
          )
        ) as HTMLSelectElement[]
      ) {
        const option =
          Array.from(
            select.options
          )
            .find(
              x =>
                cityMatch(
                  x.textContent
                )
            );

        if (!option)
          continue;

        const descriptor =
          Object
            .getOwnPropertyDescriptor(
              HTMLSelectElement.prototype,
              "value"
            );

        if (
          descriptor?.set
        ) {
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

        return {
          ok:true,
          method:"select",
          label:
            clean(
              option.textContent
            ),
          value:
            option.value
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
                element
                  .getClientRects()
                  .length
              );

            if (!visible)
              return false;

            const label =
              clean(
                element.innerText ??
                element.textContent
              );

            return (
              label.length <= 80 &&
              cityMatch(label)
            );
          }
        );

      if (node) {
        const label =
          clean(
            node.innerText ??
            node.textContent
          );

        node.click();

        return {
          ok:true,
          method:"click",
          label
        };
      }


      const selectOptions =
        Array.from(
          document.querySelectorAll(
            "select option"
          )
        )
          .map(
            option =>
              clean(
                option.textContent
              )
          )
          .filter(Boolean)
          .slice(0,60);

      const clickableLabels =
        nodes
          .filter(
            element =>
              Boolean(
                element.offsetWidth ||
                element.offsetHeight ||
                element
                  .getClientRects()
                  .length
              )
          )
          .map(
            element =>
              clean(
                element.innerText ??
                element.textContent
              )
          )
          .filter(
            label =>
              label.length > 0 &&
              label.length <= 80
          )
          .filter(
            (
              value,
              index,
              values
            ) =>
              values.indexOf(value) ===
              index
          )
          .slice(0,80);

      const inputValues =
        Array.from(
          document.querySelectorAll(
            "input"
          )
        )
          .map(
            input => ({
              type:
                (
                  input as
                    HTMLInputElement
                ).type,

              value:
                (
                  input as
                    HTMLInputElement
                ).value
            })
          )
          .slice(0,20);

      return {
        ok:false,
        method:null,
        target:wantedCity,
        selectOptions,
        clickableLabels,
        inputValues
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


async function raceControlState(
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
                element
                  .getClientRects()
                  .length
              );

            if (!visible)
              return false;

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
        return {
          found:false,
          active:false
        };
      }

      const chain =
        [
          node,
          node.parentElement,
          node.closest(
            "[role='tab']"
          ),
          node.closest("li")
        ]
          .filter(Boolean) as
            HTMLElement[];

      let active=false;

      for (const element of chain) {
        const attrs =
          [
            element.getAttribute(
              "aria-selected"
            ),
            element.getAttribute(
              "aria-current"
            ),
            element.getAttribute(
              "data-state"
            ),
            element.getAttribute(
              "data-active"
            ),
            element.getAttribute(
              "data-selected"
            )
          ]
            .filter(Boolean)
            .map(
              value =>
                String(value)
                  .toLowerCase()
            );

        const className =
          String(
            element.className ??
            ""
          )
            .toLowerCase();

        if (
          attrs.some(
            value =>
              [
                "true",
                "active",
                "selected",
                "current",
                "page",
                "step"
              ].includes(value)
          ) ||
          /(^|\s)(active|selected|current)(\s|$)/
            .test(className)
        ) {
          active=true;
          break;
        }
      }

      return {
        found:true,
        active,

        text:
          String(
            node.innerText ??
            node.textContent ??
            ""
          ),

        ariaSelected:
          node.getAttribute(
            "aria-selected"
          ),

        ariaCurrent:
          node.getAttribute(
            "aria-current"
          ),

        dataState:
          node.getAttribute(
            "data-state"
          ),

        className:
          String(
            node.className ??
            ""
          )
      };
    },
    raceNumber,
    CLICKABLE
  );
}



function controlSignature(
  value:any
):string {
  return JSON.stringify({
    found:
      Boolean(
        value?.found
      ),

    text:
      String(
        value?.text ??
        ""
      ),

    ariaSelected:
      value?.ariaSelected ??
      null,

    ariaCurrent:
      value?.ariaCurrent ??
      null,

    dataState:
      value?.dataState ??
      null,

    className:
      String(
        value?.className ??
        ""
      )
  });
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
  raceNumber:number,
  excludedFingerprints:string[]
) {
  return String(
    await page.evaluate(
      (
        wantedRace:number,
        excluded:string[]
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

        const excludedSet =
          new Set(
            excluded
              .map(
                value =>
                  foldLocal(value)
              )
          );

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
                    node
                      .getClientRects()
                      .length
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

                /*
                 * Never reuse a panel already assigned
                 * to another race.
                 */
                if (
                  excludedSet.has(
                    normalized
                  )
                ) {
                  return null;
                }

                const races =
                  new Set(
                    [
                      ...normalized.matchAll(
                        /\b(\d{1,2})\s+KOSU\b/g
                      )
                    ]
                      .map(
                        match =>
                          Number(
                            match[1]
                          )
                      )
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
                        normalized.includes(
                          key
                        )
                    )
                    .length;

                if (semantics < 2) {
                  return null;
                }

                return {
                  text,

                  score:
                    (
                      normalized.includes(
                        expected
                      )
                        ? 2000
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

        return (
          candidates[0]
            ?.text ??
          ""
        );
      },
      raceNumber,
      excludedFingerprints
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
        waitUntil:
          "domcontentloaded",

        timeout:
          10_000
      }
    );

    await page.waitForSelector(
      "input",
      {
        timeout:
          5_000
      }
    );

    const dateState =
      await setDate(
        page,
        context.raceDate
      );

    /*
     * Do not treat a date string in body text as proof.
     * The target city's rendered control is the real proof.
     */
    let cityState:any = {
      ok:false
    };

    for (
      let attempt=0;
      attempt<30;
      attempt++
    ) {
      cityState =
        await activateCity(
          page,
          city
        );

      if (
        cityState.ok
      ) {
        break;
      }

      if (
        attempt === 12
      ) {
        await setDate(
          page,
          context.raceDate
        );
      }

      await delay(200);
    }

    if (!cityState.ok) {
      throw new Error(
        "AFA_TARGET_CITY_NOT_FOUND:" +
        JSON.stringify({
          city,
          raceDate:
            context.raceDate,
          dateState,
          renderedState:
            cityState
        })
      );
    }

    let races:number[] =
      [];

    for (
      let attempt=0;
      attempt<20;
      attempt++
    ) {
      races =
        await getRaceNumbers(
          page
        );

      if (
        races.length
      ) {
        break;
      }

      await delay(180);
    }

    if (!races.length) {
      throw new Error(
        "AFA_RACE_CONTROLS_NOT_FOUND:" +
        JSON.stringify({
          city,
          raceDate:
            context.raceDate,
          dateState,
          cityState
        })
      );
    }

    /*
     * The SPA normally opens with race 1 already selected.
     *
     * Do not force an unverified synthetic pre-click.
     * Race 1 becomes the verified baseline.
     */

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

      const beforeControl =
        await raceControlState(
          page,
          raceNumber
        );

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

      let lastTransitionDiagnostics:
        any = null;

      /*
       * A click is NOT proof that the SPA changed race.
       *
       * Accept a panel only when:
       * - it is semantically useful,
       * - it is not a fingerprint already used by another race,
       * - AND we can prove transition through:
       *     a) new changed DOM lines, or
       *     b) selected/active race control, or
       *     c) explicit target race identity in panel.
       *
       * A stale duplicate panel is waited/re-clicked, not
       * immediately accepted or mislabeled.
       */
      for (
        let attempt=0;
        attempt<10;
        attempt++
      ) {
        await delay(
          attempt === 0
            ? 220
            : 100
        );

        const after =
          await bodyText(page);

        const control =
          await raceControlState(
            page,
            raceNumber
          );

        /*
         * The frontend uses Tailwind class changes rather than
         * a literal "active" class.
         */
        const controlChanged =
          controlSignature(
            beforeControl
          ) !==
          controlSignature(
            control
          );

        const diff =
          changedLines(
            before,
            after
          );

        const fallback =
          await fallbackPanel(
            page,
            raceNumber,
            [
              ...fingerprints.keys()
            ]
          );

        const choices = [
          {
            kind:"diff",
            text:diff
          },
          {
            kind:"fallback",
            text:fallback
          }
        ];

        for (
          const choice of
          choices
        ) {
          if (
            !usefulPanel(
              choice.text
            )
          ) {
            continue;
          }

          const candidateFingerprint =
            fold(
              choice.text
            );

          const duplicateRace =
            fingerprints.get(
              candidateFingerprint
            );

          const explicitRaceIdentity =
            candidateFingerprint
              .includes(
                fold(
                  `${raceNumber} koşu`
                )
              );

          const initialBaseline =
            panels.length === 0 &&
            raceNumber === races[0] &&
            choice.kind === "fallback" &&
            control.found === true &&
            duplicateRace ===
              undefined;

          const transitionProof =
            choice.kind === "diff" ||
            controlChanged ||
            control.active === true ||
            explicitRaceIdentity ||
            initialBaseline;

          lastTransitionDiagnostics = {
            city,
            raceNumber,
            attempt,
            source:
              choice.kind,
            beforeControl,
            control,
            controlChanged,
            initialBaseline,
            explicitRaceIdentity,
            transitionProof,
            duplicateRace:
              duplicateRace ??
              null,
            beforeCharacters:
              before.length,
            afterCharacters:
              after.length,
            candidateCharacters:
              choice.text.length
          };

          if (
            duplicateRace !==
              undefined &&
            duplicateRace !==
              raceNumber
          ) {
            /*
             * SPA may still be rendering the old race.
             * Keep waiting; do not throw yet.
             */
            continue;
          }

          if (!transitionProof) {
            continue;
          }

          panel=
            choice.text;

          break;
        }

        if (panel) {
          break;
        }

        /*
         * Re-click twice during bounded wait in case the first
         * synthetic click was swallowed by the frontend.
         */
        if (
          attempt === 3 ||
          attempt === 6
        ) {
          await clickRace(
            page,
            raceNumber
          );
        }
      }

      if (!panel) {
        throw new Error(
          "AFA_RACE_TRANSITION_NOT_CONFIRMED:" +
          JSON.stringify(
            lastTransitionDiagnostics ?? {
              city,
              raceNumber,
              reason:
                "NO_USEFUL_TRANSITION_PANEL"
            }
          )
        );
      }

      const fingerprint =
        fold(panel);

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
      bodyLength:html.length,

      diagnostics:{
        traceVersion:
          "afa-state-transition-v6",

        city,
        races,

        dateState,
        cityState,

        panelCount:
          panels.length,

        panelFingerprints:
          panels.map(
            panel => ({
              raceNumber:
                panel.raceNumber,

              characters:
                panel.text.length
            })
          )
      }
    } as AcquiredHtml & {
      diagnostics:any
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
