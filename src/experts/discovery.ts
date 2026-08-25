import {
  load
} from "cheerio";

import type {
  Env
} from "../env";

import {
  extractSemanticJsonFromHtml
} from "../acquisition/semantic-json";

import {
  EXPERT_ACQUISITION_CONFIG,
  expertSourceConfig
} from "../config/expert-acquisition";

import type {
  ExpertAcquisitionStage
} from "../config/expert-acquisition";

import {
  acquireExpertHtmlStage
} from "./acquisition-fallback";

import {
  buildExpertRaceDateTokens
} from "./date-evidence";

import {
  cleanExpertInlineText,
  normalizeExpertSearchText
} from "./text-normalization";

import {
  expertNavigationLabels,
  expertRootIsEditorial,
  isAllowedDiscoveredArticleUrl,
  preferredArticlePathScore
} from "./source-policy";

import {
  turkeyDate
} from "../shared";


interface CandidateLink {
  url:
    string;

  text:
    string;

  score:
    number;

  hasCity:
    boolean;

  hasDate:
    boolean;

  hasPredictionLanguage:
    boolean;

  deterministic:
    boolean;
}


const discoverySchema = {
  type:
    "object",

  properties: {
    urls: {
      type:
        "array",

      items: {
        type:
          "string"
      }
    }
  },

  required: [
    "urls"
  ]
} as const;


function normalizedHost(
  value:
    string
): string | null {
  try {
    return new URL(value)
      .hostname
      .replace(/^www\./,"")
      .toLowerCase();

  } catch {
    return null;
  }
}


function sameHost(
  first:
    string,

  second:
    string
): boolean {
  const firstHost =
    normalizedHost(first);

  const secondHost =
    normalizedHost(second);


  return Boolean(
    firstHost &&
    secondHost &&
    firstHost ===
      secondHost
  );
}


function normalizeUrl(
  base:
    string,

  value:
    string
): string | null {
  try {
    const url =
      new URL(
        value,
        base
      );


    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }


    url.hash = "";


    return url.toString();

  } catch {
    return null;
  }
}


function isRootUrl(
  value:
    string
): boolean {
  try {
    const url =
      new URL(value);


    return (
      url.pathname === "/" &&
      !url.search
    );

  } catch {
    return false;
  }
}


function assetUrl(
  value:
    string
): boolean {
  try {
    const path =
      new URL(value)
        .pathname
        .toLowerCase();


    return EXPERT_ACQUISITION_CONFIG
      .discovery
      .assetExtensions
      .some(
        extension =>
          path.endsWith(
            extension
          )
      );

  } catch {
    return true;
  }
}


export function isUsableCandidate(
  landingUrl:
    string,

  value:
    string
): boolean {
  return (
    sameHost(
      landingUrl,
      value
    ) &&
    !assetUrl(value) &&
    !isRootUrl(value)
  );
}


function hasAnyTerm(
  material:
    string,

  values:
    string[]
): boolean {
  return values.some(
    value =>
      material.includes(
        normalizeExpertSearchText(
          value
        )
      )
  );
}


function candidateEvidence(
  sourceKey:
    string,

  value:
    string,

  text:
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


  const discovery =
    EXPERT_ACQUISITION_CONFIG
      .discovery;


  const material =
    normalizeExpertSearchText(
      `${value} ${text}`
    );


  const hasCity =
    cities.some(
      city =>
        material.includes(
          normalizeExpertSearchText(
            city
          )
        )
    );


  const hasDate =
    buildExpertRaceDateTokens(
      raceDate
    )
      .some(
        token =>
          material.includes(
            token
          )
      );


  const hasPredictionLanguage =
    hasAnyTerm(
      material,
      discovery.predictionTerms
    );


  const hasNegativeLanguage =
    hasAnyTerm(
      material,
      discovery.negativeTerms
    );


  const pathScore =
    preferredArticlePathScore(
      sourceKey,
      value
    );


  const contextBoost =
    source.contextBoostTerms
      .some(
        term =>
          material.includes(
            normalizeExpertSearchText(
              term
            )
          )
      )
      ? 4
      : 0;


  let score =
    pathScore +
    contextBoost;


  if (hasCity) {
    score += 5;
  }


  if (hasDate) {
    score += 5;
  }


  if (
    hasPredictionLanguage
  ) {
    score += 4;
  }


  if (
    hasNegativeLanguage
  ) {
    score -= 25;
  }


  return {
    score,
    hasCity,
    hasDate,
    hasPredictionLanguage,

    deterministic:
      !hasNegativeLanguage &&
      hasCity &&
      hasPredictionLanguage &&
      (
        hasDate ||
        pathScore >= 5
      ) &&
      score >=
        discovery
          .deterministicMinScore
  };
}


function candidatesFromHtml(
  sourceKey:
    string,

  landingUrl:
    string,

  html:
    string,

  raceDate:
    string,

  cities:
    string[]
): CandidateLink[] {
  const discovery =
    EXPERT_ACQUISITION_CONFIG
      .discovery;


  const $ =
    load(html);


  $(
    [
      "script",
      "style",
      "noscript",
      "svg",
      "canvas",
      "iframe"
    ].join(",")
  ).remove();


  const contextSelector =
    discovery
      .contextContainers
      .join(",");


  const output:
    CandidateLink[] = [];


  $("a[href]").each(
    (
      _index,
      element
    ) => {
      const anchor =
        $(element);


      const href =
        anchor.attr(
          "href"
        );


      if (!href) {
        return;
      }


      const url =
        normalizeUrl(
          landingUrl,
          href
        );


      if (
        !url ||
        !isUsableCandidate(
          landingUrl,
          url
        ) ||
        !isAllowedDiscoveredArticleUrl(
          sourceKey,
          url
        )
      ) {
        return;
      }


      const context =
        anchor.closest(
          contextSelector
        )
          .first();


      const text =
        cleanExpertInlineText(
          [
            anchor.text(),
            context.text()
          ]
            .filter(Boolean)
            .join(" | "),

          discovery
            .candidateContextCharacters
        );


      const evidence =
        candidateEvidence(
          sourceKey,
          url,
          text,
          raceDate,
          cities
        );


      if (
        evidence.score <
        discovery
          .candidateMinScore
      ) {
        return;
      }


      output.push({
        url,
        text,
        ...evidence
      });
    }
  );


  const deduped =
    new Map<
      string,
      CandidateLink
    >();


  for (const candidate of output) {
    const old =
      deduped.get(
        candidate.url
      );


    if (
      !old ||
      candidate.score >
        old.score
    ) {
      deduped.set(
        candidate.url,
        candidate
      );
    }
  }


  return [
    ...deduped.values()
  ]
    .sort(
      (
        first,
        second
      ) =>
        second.score -
        first.score
    )
    .slice(
      0,
      discovery.maxCandidates
    );
}


function escapeHtml(
  value:
    string
): string {
  return value
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}


function candidatesAsHtml(
  values:
    CandidateLink[]
): string {
  return `
<html>
<body>
<ul>
${
  values
    .map(
      value =>
        `<li data-score="${value.score}">
          <a href="${escapeHtml(value.url)}">
            ${escapeHtml(value.text)}
          </a>
        </li>`
    )
    .join("\n")
}
</ul>
</body>
</html>
`.trim();
}


function normalizeSelectedUrls(
  landingUrl:
    string,

  value:
    unknown
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .map(
          item =>
            normalizeUrl(
              landingUrl,
              String(item)
            )
        )
        .filter(
          (
            item
          ): item is string =>
            Boolean(item)
        )
        .filter(
          item =>
            sameHost(
              landingUrl,
              item
            )
        )
    )
  ];
}


async function selectCandidates(
  env:
    Env,

  sourceKey:
    string,

  sourceName:
    string,

  landingUrl:
    string,

  raceDate:
    string,

  cities:
    string[],

  candidates:
    CandidateLink[],

  stage:
    ExpertAcquisitionStage
) {
  const deterministic =
    candidates
      .filter(
        candidate =>
          candidate.deterministic
      )
      .map(
        candidate =>
          candidate.url
      );


  if (!candidates.length) {
    return {
      urls:[],

      diagnostics:{
        stage,
        aiInvoked:false,
        candidateCount:0,
        deterministic:[]
      }
    };
  }


  const prompt = `
${sourceName} sitesinin gerçek DOM/HTML candidate linkleri.

HEDEF TARİH:
${raceDate}

HEDEF TJK ŞEHİRLERİ:
${cities.join(", ")}

Yalnız bu listede gerçekten bulunan current Türkiye at yarışı
TAHMİN / ANALİZ / UZMAN YORUM targetlarını seç.

Kurallar:

- Listede olmayan URL üretme.
- Eski tarihli article seçme.
- Yurt dışı yarışı seçme.
- Genel haber seçme.
- Koşmama, sakatlık, satış, transfer ve sonuç/program haberi seçme.
- Navigasyon/kategori sayfasını current article sanma.
- Aynı gün birden fazla gerçek şehir/article varsa hepsini seç.
- URL prefix'i değişmiş olabilir; eski prefix tek başına hard truth değildir.
- Anchor/card context + hedef tarih + hedef şehir + tahmin bağlamını birlikte değerlendir.
- Emin değilsen seçme.

Yalnız JSON schema'ya uygun cevap ver.
`.trim();


  try {
    const semantic =
      await extractSemanticJsonFromHtml<any>(
        env,
        candidatesAsHtml(
          candidates
        ),
        prompt,
        {
          type:
            "json_schema",

          json_schema:
            discoverySchema
        }
      );


    const candidateSet =
      new Set(
        candidates.map(
          candidate =>
            candidate.url
        )
      );


    const selected =
      normalizeSelectedUrls(
        landingUrl,
        semantic.value?.urls
      )
        .filter(
          url =>
            candidateSet.has(url)
        )
        .filter(
          url =>
            isAllowedDiscoveredArticleUrl(
              sourceKey,
              url
            )
        );


    /*
     * Do not let AI silently drop a second deterministic
     * current-city/current-article target.
     */
    const urls =
      [
        ...new Set([
          ...deterministic,
          ...selected
        ])
      ];


    return {
      urls,

      diagnostics:{
        stage,
        aiInvoked:true,

        candidateCount:
          candidates.length,

        candidateSample:
          candidates.slice(
            0,
            20
          ),

        deterministic,
        aiSelected:
          selected,

        selected:
          urls,

        semantic:
          semantic.diagnostics
      }
    };

  } catch(error) {
    /*
     * Candidate AI failure cannot destroy strong local
     * deterministic evidence.
     */
    return {
      urls:
        deterministic,

      diagnostics:{
        stage,
        aiInvoked:true,

        candidateCount:
          candidates.length,

        deterministic,

        selected:
          deterministic,

        aiError:
          error instanceof Error
            ? error.message
            : String(error)
      }
    };
  }
}


async function discoverFromLanding(
  env:
    Env,

  sourceKey:
    string,

  sourceName:
    string,

  landingUrl:
    string,

  raceDate:
    string,

  cities:
    string[]
) {
  const diagnostics:any = {
    stages:[]
  };


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .discovery
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          landingUrl,
          stage
        );


      const candidates =
        candidatesFromHtml(
          sourceKey,
          landingUrl,
          acquired.html,
          raceDate,
          cities
        );


      const selected =
        await selectCandidates(
          env,
          sourceKey,
          sourceName,
          landingUrl,
          raceDate,
          cities,
          candidates,
          stage
        );


      diagnostics.stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        ...selected.diagnostics
      });


      if (
        selected.urls.length
      ) {
        return {
          urls:
            selected.urls,

          method:
            `${stage}-anchored-candidate-selection`,

          diagnostics
        };
      }

    } catch(error) {
      diagnostics.stages.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    urls:[],
    method:
      "anchored-discovery-empty",
    diagnostics
  };
}


function navigationTargetFromHtml(
  rootUrl:
    string,

  sourceKey:
    string,

  html:
    string
): string | null {
  const wanted =
    expertNavigationLabels(
      sourceKey
    )
      .map(
        normalizeExpertSearchText
      );


  if (!wanted.length) {
    return null;
  }


  const $ =
    load(html);


  let winner:
    {
      url:string;
      score:number;
    } | null = null;


  $("a[href]").each(
    (
      _index,
      element
    ) => {
      const anchor =
        $(element);


      const href =
        anchor.attr(
          "href"
        );


      if (!href) {
        return;
      }


      const url =
        normalizeUrl(
          rootUrl,
          href
        );


      if (
        !url ||
        !sameHost(
          rootUrl,
          url
        ) ||
        isRootUrl(url)
      ) {
        return;
      }


      const text =
        normalizeExpertSearchText(
          anchor.text()
        );


      let score =
        0;


      for (const label of wanted) {
        if (
          text === label
        ) {
          score =
            Math.max(
              score,
              20
            );

        } else if (
          label &&
          text.includes(
            label
          )
        ) {
          score =
            Math.max(
              score,
              12
            );
        }
      }


      if (
        score &&
        (
          !winner ||
          score >
            winner.score
        )
      ) {
        winner = {
          url,
          score
        };
      }
    }
  );


  return winner?.url ??
    null;
}


async function recoverLandingFromRoot(
  env:
    Env,

  sourceKey:
    string,

  rootUrl:
    string
) {
  const diagnostics:any = {
    stages:[]
  };


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .discovery
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          rootUrl,
          stage
        );


      const recovered =
        navigationTargetFromHtml(
          rootUrl,
          sourceKey,
          acquired.html
        );


      diagnostics.stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        recovered
      });


      if (recovered) {
        return {
          url:
            recovered,

          diagnostics
        };
      }

    } catch(error) {
      diagnostics.stages.push({
        stage,

        error:
          error instanceof Error
            ? error.message
            : String(error)
      });
    }
  }


  return {
    url:null,
    diagnostics
  };
}


function directPageEvidence(
  sourceKey:
    string,

  html:
    string,

  cities:
    string[]
): boolean {
  const source =
    expertSourceConfig(
      sourceKey
    );


  const $ =
    load(html);


  $("script,style,noscript,svg,iframe")
    .remove();


  const text =
    normalizeExpertSearchText(
      $("body")
        .text()
    );


  if (
    text.length <
    EXPERT_ACQUISITION_CONFIG
      .extraction
      .minimumTextCharacters
  ) {
    return false;
  }


  if (
    !hasAnyTerm(
      text,
      EXPERT_ACQUISITION_CONFIG
        .extraction
        .relevanceTerms
    )
  ) {
    return false;
  }


  if (
    !source.preflightRequiresCity
  ) {
    return true;
  }


  return cities.some(
    city =>
      text.includes(
        normalizeExpertSearchText(
          city
        )
      )
  );
}


async function probeDirectPage(
  env:
    Env,

  sourceKey:
    string,

  url:
    string,

  cities:
    string[]
) {
  const diagnostics:any = {
    stages:[]
  };


  for (
    const stage of
    EXPERT_ACQUISITION_CONFIG
      .discovery
      .acquisitionOrder
  ) {
    try {
      const acquired =
        await acquireExpertHtmlStage(
          env,
          url,
          stage
        );


      const usable =
        directPageEvidence(
          sourceKey,
          acquired.html,
          cities
        );


      diagnostics.stages.push({
        stage,

        bodyLength:
          acquired.bodyLength,

        usable
      });


      if (usable) {
        return {
          ok:true,
          diagnostics
        };
      }

    } catch(error) {
      diagnostics.stages.push({
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


export async function resolveDirectCurrentPageUrl(
  env:
    Env,

  sourceKey:
    string,

  entryUrls:
    string[],

  rootUrl:
    string | null,

  cities:
    string[]
) {
  const diagnostics:any = {
    directAttempts:[],
    rootRecovery:null
  };


  const primary =
    entryUrls.filter(
      url =>
        !rootUrl ||
        url !== rootUrl
    );


  for (const url of primary) {
    const result =
      await probeDirectPage(
        env,
        sourceKey,
        url,
        cities
      );


    diagnostics.directAttempts.push({
      url,
      ...result
    });


    if (result.ok) {
      return {
        url,
        diagnostics
      };
    }
  }


  /*
   * Known direct path moved:
   *
   * root is used ONLY to recover the new navigation href.
   */
  if (rootUrl) {
    const recovery =
      await recoverLandingFromRoot(
        env,
        sourceKey,
        rootUrl
      );


    diagnostics.rootRecovery =
      recovery;


    if (recovery.url) {
      const probe =
        await probeDirectPage(
          env,
          sourceKey,
          recovery.url,
          cities
        );


      diagnostics.recoveredProbe = {
        url:
          recovery.url,

        ...probe
      };


      if (probe.ok) {
        return {
          url:
            recovery.url,

          diagnostics
        };
      }
    }
  }


  return {
    url:null,
    diagnostics
  };
}


export async function discoverExpertArticleUrls(
  env:
    Env,

  landingUrl:
    string,

  sourceName:
    string,

  cities:
    string[],

  sourceKey =
    "",

  raceDateOverride?:
    string
) {
  const raceDate =
    raceDateOverride ??
    turkeyDate();


  /*
   * A root that is not itself the intended editorial
   * surface first tries navigation recovery.
   */
  if (
    isRootUrl(
      landingUrl
    ) &&
    !expertRootIsEditorial(
      sourceKey
    )
  ) {
    const recovery =
      await recoverLandingFromRoot(
        env,
        sourceKey,
        landingUrl
      );


    if (
      recovery.url &&
      recovery.url !==
        landingUrl
    ) {
      const recovered =
        await discoverFromLanding(
          env,
          sourceKey,
          sourceName,
          recovery.url,
          raceDate,
          cities
        );


      if (
        recovered.urls.length
      ) {
        return {
          ...recovered,

          method:
            `root-nav-recovery:${recovered.method}`,

          diagnostics:{
            rootRecovery:
              recovery,

            recoveredLanding:
              recovery.url,

            discovery:
              recovered.diagnostics
          }
        };
      }
    }


    /*
     * Last structural recovery:
     *
     * root itself may still link directly to today's
     * articles even if the old navigation label changed.
     *
     * Local date/city/prediction filtering still applies.
     */
    const rootFallback =
      await discoverFromLanding(
        env,
        sourceKey,
        sourceName,
        landingUrl,
        raceDate,
        cities
      );


    return {
      ...rootFallback,

      diagnostics:{
        rootRecovery:
          recovery,

        rootFallback:
          rootFallback.diagnostics
      }
    };
  }


  return discoverFromLanding(
    env,
    sourceKey,
    sourceName,
    landingUrl,
    raceDate,
    cities
  );
}
