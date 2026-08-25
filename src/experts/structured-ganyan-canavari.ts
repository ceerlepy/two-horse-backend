import {
  load
} from "cheerio";

import type {
  Env
} from "../env";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../config/expert-acquisition";

import {
  acquireExpertHtmlStage
} from "./acquisition-fallback";

import {
  buildExpertRaceDateTokens
} from "./date-evidence";

import {
  normalizeExpertSearchText
} from "./text-normalization";


export interface GanyanCityState {
  city:
    string;

  venueValue:
    string;

  citySlug:
    string;
}


function sameHost(
  value:
    string,

  host:
    string
): boolean {
  try {
    return new URL(
      value
    )
      .hostname
      .replace(/^www\./,"")
      .toLowerCase() ===
      host
        .replace(/^www\./,"")
        .toLowerCase();

  } catch {
    return false;
  }
}


function normalizedCity(
  value:
    string
): string {
  return normalizeExpertSearchText(
    value
  );
}


function slugForCity(
  city:
    string
): string {
  return normalizedCity(
    city
  )
    .replace(
      /\s+/g,
      "-"
    );
}


function venueValueFromRaw(
  value:
    unknown
): string | null {
  const raw =
    String(
      value ??
      ""
    ).trim();


  if (!raw) {
    return null;
  }


  const match =
    raw.match(
      /(?:^|\D)(\d{1,6})(?:\D|$)/
    );


  if (!match) {
    return null;
  }


  const numeric =
    Number(
      match[1]
    );


  if (
    !Number.isInteger(
      numeric
    ) ||
    numeric <= 0
  ) {
    return null;
  }


  return String(
    numeric
  );
}


function regexEscape(
  value:
    string
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


export function discoverGanyanCityStates(
  html:
    string,

  cities:
    string[]
): GanyanCityState[] {
  const $ =
    load(
      html
    );


  const output =
    new Map<
      string,
      GanyanCityState
    >();


  $("option")
    .each(
      (
        _index,
        element
      ) => {
        const option =
          $(element);


        const optionText =
          normalizedCity(
            option.text()
          );


        const city =
          cities.find(
            candidate => {
              const target =
                normalizedCity(
                  candidate
                );


              return (
                optionText ===
                  target ||
                optionText.startsWith(
                  `${target} `
                ) ||
                optionText.endsWith(
                  ` ${target}`
                )
              );
            }
          );


        if (!city) {
          return;
        }


        const rawValues =
          [
            option.attr(
              "data-city-id"
            ),
            option.attr(
              "data-sehir-id"
            ),
            option.attr(
              "data-hipodrom-id"
            ),
            option.attr(
              "data-venue-id"
            ),
            option.attr(
              "data-id"
            ),
            option.attr(
              "value"
            )
          ];


        let venueValue:
          string | null =
          null;


        for (
          const raw of
          rawValues
        ) {
          venueValue =
            venueValueFromRaw(
              raw
            );


          if (venueValue) {
            break;
          }
        }


        if (!venueValue) {
          return;
        }


        const slug =
          String(
            option.attr(
              "data-slug"
            ) ??
            ""
          ).trim() ||
          slugForCity(
            city
          );


        output.set(
          normalizedCity(
            city
          ),
          {
            city,
            venueValue,
            citySlug:
              slug
          }
        );
      }
    );


  /*
   * Fail-safe fallback for rendered/select HTML variants where
   * Cheerio sees the option but attributes are serialized oddly.
   *
   * It still requires the site's own numeric option value.
   * No city ID is invented here.
   */
  for (const city of cities) {
    const key =
      normalizedCity(
        city
      );


    if (
      output.has(
        key
      )
    ) {
      continue;
    }


    const escaped =
      regexEscape(
        city
      );


    const pattern =
      new RegExp(
        `<option[^>]*value=["']?([^"'\\s>]+)["']?[^>]*>[^<]*${escaped}[^<]*<\\/option>`,
        "iu"
      );


    const match =
      html.match(
        pattern
      );


    const venueValue =
      venueValueFromRaw(
        match?.[1]
      );


    if (!venueValue) {
      continue;
    }


    output.set(
      key,
      {
        city,
        venueValue,
        citySlug:
          slugForCity(
            city
          )
      }
    );
  }


  return [
    ...output.values()
  ];
}


export function buildGanyanTargetUrl(
  baseUrl:
    string,

  raceDate:
    string,

  city:
    string,

  venueValue:
    string,

  pathTemplate:
    string,

  explicitSlug?:
    string
): string | null {
  const parts =
    raceDate.split("-");


  if (
    parts.length !== 3
  ) {
    return null;
  }


  const [
    yyyy,
    mm,
    dd
  ] =
    parts;


  if (
    !/^\d{4}$/.test(
      yyyy
    ) ||
    !/^\d{2}$/.test(
      mm
    ) ||
    !/^\d{2}$/.test(
      dd
    ) ||
    !/^\d+$/.test(
      venueValue
    )
  ) {
    return null;
  }


  const path =
    pathTemplate
      .replace(
        /\{yyyy\}/g,
        yyyy
      )
      .replace(
        /\{mm\}/g,
        mm
      )
      .replace(
        /\{dd\}/g,
        dd
      )
      .replace(
        /\{venueValue\}/g,
        venueValue
      )
      .replace(
        /\{citySlug\}/g,
        explicitSlug ||
        slugForCity(
          city
        )
      );


  try {
    return new URL(
      path,
      baseUrl
    ).toString();

  } catch {
    return null;
  }
}


function rootUrlFor(
  sourceKey:
    string
): string {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const configuredRoot =
    source.entryUrls
      .find(
        value => {
          try {
            const url =
              new URL(
                value
              );

            return (
              url.pathname ===
                "/" &&
              !url.search
            );

          } catch {
            return false;
          }
        }
      );


  return configuredRoot ??
    `https://www.${source.host}/`;
}


function navigationSurfaces(
  sourceKey:
    string,

  rootUrl:
    string,

  html:
    string
): string[] {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const wanted =
    source.navigationLabels
      .map(
        normalizeExpertSearchText
      );


  const $ =
    load(
      html
    );


  const result =
    new Set<string>();


  $("a[href]")
    .each(
      (
        _index,
        element
      ) => {
        const anchor =
          $(element);


        const text =
          normalizeExpertSearchText(
            anchor.text()
          );


        if (
          !wanted.some(
            label =>
              label &&
              (
                text ===
                  label ||
                text.includes(
                  label
                )
              )
          )
        ) {
          return;
        }


        const href =
          anchor.attr(
            "href"
          );


        if (!href) {
          return;
        }


        try {
          const url =
            new URL(
              href,
              rootUrl
            );


          if (
            sameHost(
              url.toString(),
              source.host
            ) &&
            url.pathname !==
              "/"
          ) {
            result.add(
              url.toString()
            );
          }

        } catch {
          return;
        }
      }
    );


  return [
    ...result
  ];
}


async function inspectSurface(
  env:
    Env,

  sourceKey:
    string,

  url:
    string,

  cities:
    string[]
) {
  const diagnostics:any[] =
    [];


  const merged =
    new Map<
      string,
      GanyanCityState
    >();


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          url,
          stage
        );


      const states =
        discoverGanyanCityStates(
          acquired.html,
          cities
        );


      for (const state of states) {
        merged.set(
          normalizedCity(
            state.city
          ),
          state
        );
      }


      diagnostics.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        discoveredStates:
          states
      });


      if (
        cities.every(
          city =>
            merged.has(
              normalizedCity(
                city
              )
            )
        )
      ) {
        break;
      }

    } catch(error) {
      diagnostics.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    states:[
      ...merged.values()
    ],

    diagnostics
  };
}


async function recoverStructuredSurfaces(
  env:
    Env,

  sourceKey:
    string,

  rootUrl:
    string
) {
  const diagnostics:any[] =
    [];


  const result =
    new Set<string>();


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          rootUrl,
          stage
        );


      const surfaces =
        navigationSurfaces(
          sourceKey,
          rootUrl,
          acquired.html
        );


      for (const surface of surfaces) {
        result.add(
          surface
        );
      }


      diagnostics.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        surfaces
      });


      if (result.size) {
        break;
      }

    } catch(error) {
      diagnostics.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    surfaces:[
      ...result
    ],

    diagnostics
  };
}


async function probeTarget(
  env:
    Env,

  sourceKey:
    string,

  url:
    string,

  raceDate:
    string,

  city:
    string
) {
  const diagnostics:any[] =
    [];


  const targetDateTokens =
    buildExpertRaceDateTokens(
      raceDate,
      {
        allowYearless:false
      }
    );


  const requestPathDateHit =
    targetDateTokens.some(
      token =>
        normalizeExpertSearchText(
          url
        ).includes(
          token
        )
    );


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          url,
          stage
        );


      const $ =
        load(
          acquired.html
        );


      $(
        [
          "script",
          "style",
          "noscript",
          "nav",
          "header",
          "footer",
          "select",
          "option"
        ].join(",")
      ).remove();


      const bodyText =
        $("body")
          .text();


      const body =
        normalizeExpertSearchText(
          bodyText
        );


      const canonicalUrl =
        String(
          $(
            'link[rel="canonical"]'
          )
            .attr(
              "href"
            ) ??
          acquired.finalUrl ??
          ""
        );


      const responseDateMaterial =
        normalizeExpertSearchText(
          [
            canonicalUrl,
            acquired.html.slice(
              0,
              20_000
            )
          ].join(" ")
        );


      const responseDateHit =
        targetDateTokens.some(
          token =>
            responseDateMaterial
              .includes(
                token
              )
        );


      const cityHit =
        body.includes(
          normalizedCity(
            city
          )
        );


      const racingHit =
        [
          "en son tahmin",
          "tahmin",
          "koşu",
          "galop",
          "banko",
          "favori",
          "yorum"
        ]
          .map(
            normalizeExpertSearchText
          )
          .some(
            term =>
              body.includes(
                term
              )
          );


      const usable =
        body.length >=
          EXPERT_ACQUISITION_CONFIG
            .extraction
            .minimumTextCharacters &&
        cityHit &&
        racingHit &&
        (
          responseDateHit ||
          requestPathDateHit
        );


      diagnostics.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        cityHit,
        racingHit,
        responseDateHit,
        requestPathDateHit,
        usable
      });


      if (usable) {
        return {
          ok:true,
          diagnostics
        };
      }

    } catch(error) {
      diagnostics.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    ok:false,
    diagnostics
  };
}


export async function resolveGanyanCanavariStructuredTargets(
  env:
    Env,

  sourceKey:
    string,

  raceDate:
    string,

  cities:
    string[]
) {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const structured =
    source
      .structuredResolver;


  const diagnostics:any = {
    configured:
      Boolean(
        structured
      ),

    surfaces:[],
    rootRecovery:null,
    cityStates:[],
    targets:[]
  };


  if (
    !structured ||
    structured.kind !==
      "ganyan-canavari"
  ) {
    return {
      urls:[],
      complete:false,
      missingCities:[
        ...cities
      ],
      diagnostics
    };
  }


  const rootUrl =
    rootUrlFor(
      sourceKey
    );


  const initialSurfaces =
    source.entryUrls
      .filter(
        value => {
          try {
            const url =
              new URL(
                value
              );

            return (
              sameHost(
                value,
                source.host
              ) &&
              !(
                url.pathname ===
                  "/" &&
                !url.search
              )
            );

          } catch {
            return false;
          }
        }
      );


  const cityStates =
    new Map<
      string,
      GanyanCityState
    >();


  const inspected =
    new Set<string>();


  const inspect =
    async (
      surface:
        string
    ) => {
      if (
        inspected.has(
          surface
        )
      ) {
        return;
      }


      inspected.add(
        surface
      );


      const result =
        await inspectSurface(
          env,
          sourceKey,
          surface,
          cities
        );


      diagnostics.surfaces.push({
        url:
          surface,

        diagnostics:
          result.diagnostics,

        states:
          result.states
      });


      for (const state of result.states) {
        cityStates.set(
          normalizedCity(
            state.city
          ),
          state
        );
      }
    };


  for (
    const surface of
    initialSurfaces
  ) {
    await inspect(
      surface
    );


    if (
      cities.every(
        city =>
          cityStates.has(
            normalizedCity(
              city
            )
          )
      )
    ) {
      break;
    }
  }


  /*
   * Root recovery is ONLY used to rediscover a structured
   * surface. A navigation URL is never accepted as an expert
   * article target.
   */
  if (
    !cities.every(
      city =>
        cityStates.has(
          normalizedCity(
            city
          )
        )
    )
  ) {
    const recovery =
      await recoverStructuredSurfaces(
        env,
        sourceKey,
        rootUrl
      );


    diagnostics.rootRecovery =
      recovery;


    for (
      const surface of
      recovery.surfaces
    ) {
      await inspect(
        surface
      );


      if (
        cities.every(
          city =>
            cityStates.has(
              normalizedCity(
                city
              )
            )
        )
      ) {
        break;
      }
    }
  }


  diagnostics.cityStates =
    [
      ...cityStates.values()
    ];


  const urls:
    string[] = [];


  const failedProbeCities:
    string[] = [];


  for (const city of cities) {
    const state =
      cityStates.get(
        normalizedCity(
          city
        )
      );


    if (!state) {
      continue;
    }


    const target =
      buildGanyanTargetUrl(
        rootUrl,
        raceDate,
        city,
        state.venueValue,
        structured.pathTemplate,
        state.citySlug
      );


    if (!target) {
      failedProbeCities.push(
        city
      );

      continue;
    }


    const probe =
      await probeTarget(
        env,
        sourceKey,
        target,
        raceDate,
        city
      );


    diagnostics.targets.push({
      city,
      target,
      probe
    });


    if (probe.ok) {
      urls.push(
        target
      );

    } else {
      failedProbeCities.push(
        city
      );
    }
  }


  const missingCities =
    cities.filter(
      city =>
        !cityStates.has(
          normalizedCity(
            city
          )
        )
    );


  const complete =
    missingCities.length ===
      0 &&
    failedProbeCities.length ===
      0 &&
    urls.length ===
      cities.length;


  return {
    urls,
    complete,
    missingCities,
    failedProbeCities,
    diagnostics
  };
}
