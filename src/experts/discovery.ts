import type {
  Env
} from "../env";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

import {
  acquireCfContentHtml
} from "../acquisition/cloudflare-html";

import {
  turkeyDate
} from "../shared";


const discoverySchema = {
  type: "object",

  properties: {
    urls: {
      type: "array",

      items: {
        type: "string"
      }
    }
  },

  required: [
    "urls"
  ]
} as const;


interface CandidateLink {
  url: string;
  text: string;
}


function sameHost(
  a: string,
  b: string
): boolean {
  try {
    return (
      new URL(a).hostname
        .replace(/^www\./,"")
        .toLowerCase() ===

      new URL(b).hostname
        .replace(/^www\./,"")
        .toLowerCase()
    );
  } catch {
    return false;
  }
}


function normalizeUrl(
  base: string,
  value: string
): string | null {
  try {
    const url =
      new URL(
        value,
        base
      );

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}


const ASSET_EXTENSIONS =
  /\.(?:jpg|jpeg|png|gif|webp|svg|ico|pdf|zip|rar|mp4|mp3|css|js|xml)(?:\?|$)/i;


/*
 * Only things that are unambiguously NOT prediction
 * articles belong here.
 *
 * Do NOT put semantic racing words here.
 */
const OBVIOUS_NON_CONTENT_PATHS = [
  "/login",
  "/logout",
  "/register",
  "/uye-girisi",
  "/uyelik",
  "/account",
  "/hesabim",
  "/cart",
  "/sepet",
  "/privacy",
  "/gizlilik",
  "/kvkk",
  "/terms",
  "/kullanim-sartlari",
  "/contact",
  "/iletisim",
  "/about",
  "/hakkimizda"
];


function cleanText(
  value: unknown
): string {
  return String(
    value ?? ""
  )
    .replace(/\s+/g," ")
    .trim()
    .slice(0,500);
}


function isUsableCandidate(
  landingUrl: string,
  url: string
): boolean {
  if (
    !sameHost(
      landingUrl,
      url
    )
  ) {
    return false;
  }

  if (
    ASSET_EXTENSIONS.test(url)
  ) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    const path =
      parsed.pathname.toLowerCase();

    if (
      OBVIOUS_NON_CONTENT_PATHS.some(
        item =>
          path === item ||
          path.startsWith(
            `${item}/`
          )
      )
    ) {
      return false;
    }

    /*
     * Homepage itself is not an article candidate.
     */
    if (
      path === "/" &&
      !parsed.search
    ) {
      return false;
    }

    return true;

  } catch {
    return false;
  }
}


function dedupeCandidates(
  landingUrl: string,
  values: CandidateLink[]
): CandidateLink[] {
  const result:
    CandidateLink[] = [];

  const seen =
    new Set<string>();

  for (const item of values) {
    const url =
      normalizeUrl(
        landingUrl,
        item.url
      );

    if (
      !url ||
      seen.has(url) ||
      !isUsableCandidate(
        landingUrl,
        url
      )
    ) {
      continue;
    }

    seen.add(url);

    result.push({
      url,
      text:
        cleanText(
          item.text
        )
    });
  }

  /*
   * Keep the AI input bounded, but deliberately generous.
   * This is NOT semantic filtering.
   */
  return result.slice(0,250);
}


function unwrapQuickAction(
  value: any
): any {
  if (
    value &&
    typeof value === "object" &&
    "result" in value
  ) {
    return value.result;
  }

  return value;
}


function findAttribute(
  attributes: unknown,
  name: string
): string | null {
  if (
    !Array.isArray(attributes)
  ) {
    return null;
  }

  for (const item of attributes) {
    if (
      item &&
      typeof item === "object" &&
      String(
        (item as any).name ?? ""
      ).toLowerCase() ===
        name.toLowerCase()
    ) {
      const value =
        (item as any).value;

      return value === undefined ||
        value === null
        ? null
        : String(value);
    }
  }

  return null;
}


/*
 * Cloudflare /scrape returns:
 *
 * [
 *   {
 *     selector:"a",
 *     results:[
 *       {
 *         text:"...",
 *         html:"...",
 *         attributes:[
 *           {name:"href", value:"..."}
 *         ]
 *       }
 *     ]
 *   }
 * ]
 */
async function scrapeAnchorCandidates(
  env: Env,
  landingUrl: string
): Promise<{
  candidates: CandidateLink[];
  browserMs: string | null;
}> {
  const response =
    await env.BROWSER.quickAction(
      "scrape",
      {
        url:
          landingUrl,

        elements: [
          {
            selector:
              "a"
          }
        ],

        /*
         * JS-heavy source pages may add article links
         * after the initial DOM event.
         */
        gotoOptions: {
          waitUntil:
            "networkidle2",

          timeout:
            30_000
        },

        rejectResourceTypes: [
          "image",
          "media",
          "font"
        ]
      } as any
    );


  if (!response.ok) {
    throw new Error(
      `DISCOVERY_SCRAPE_HTTP_${response.status}`
    );
  }


  const browserMs =
    response.headers.get(
      "X-Browser-Ms-Used"
    );


  const raw =
    unwrapQuickAction(
      await response.json()
    );


  const groups =
    Array.isArray(raw)
      ? raw
      : [];


  const found:
    CandidateLink[] = [];


  for (const group of groups) {
    if (
      !group ||
      typeof group !== "object"
    ) {
      continue;
    }

    const rows =
      Array.isArray(
        (group as any).results
      )
        ? (group as any).results
        : [];

    for (const row of rows) {
      const href =
        findAttribute(
          row?.attributes,
          "href"
        );

      if (!href) {
        continue;
      }

      found.push({
        url:
          href,

        text:
          cleanText(
            row?.text ??
            row?.html ??
            ""
          )
      });
    }
  }


  return {
    candidates:
      dedupeCandidates(
        landingUrl,
        found
      ),

    browserMs
  };
}


function decodeEntities(
  value: string
): string {
  return value
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&nbsp;/gi," ");
}


function stripTags(
  value: string
): string {
  return cleanText(
    decodeEntities(
      value.replace(
        /<[^>]+>/g,
        " "
      )
    )
  );
}


/*
 * CONTENT fallback:
 * fully rendered HTML -> anchors.
 */
function anchorsFromHtml(
  landingUrl: string,
  html: string
): CandidateLink[] {
  const found:
    CandidateLink[] = [];

  const regex =
    /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

  let match:
    RegExpExecArray | null;


  while (
    (
      match =
        regex.exec(html)
    ) !== null
  ) {
    found.push({
      url:
        match[2],

      text:
        stripTags(
          match[3]
        )
    });
  }


  return dedupeCandidates(
    landingUrl,
    found
  );
}


function candidateHtml(
  candidates: CandidateLink[]
): string {
  const escape =
    (value: string) =>
      value
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");


  const rows =
    candidates
      .map(
        (
          item,
          index
        ) =>
          `<li data-index="${index}">
             <a href="${escape(item.url)}">
               ${escape(item.text)}
             </a>
           </li>`
      )
      .join("\n");


  return `
<html>
  <body>
    <h1>Candidate article links</h1>
    <ul>
      ${rows}
    </ul>
  </body>
</html>
`.trim();
}


function normalizeSelectedUrls(
  landingUrl: string,
  raw: unknown
): string[] {
  if (
    !Array.isArray(raw)
  ) {
    return [];
  }

  const output:
    string[] = [];

  const seen =
    new Set<string>();


  for (const value of raw) {
    const url =
      normalizeUrl(
        landingUrl,
        String(value)
      );

    if (
      !url ||
      !sameHost(
        landingUrl,
        url
      ) ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);
    output.push(url);
  }


  return output.slice(0,12);
}


/*
 * AI does NOT enumerate the web page here.
 *
 * It receives only the deterministic candidates that
 * Cloudflare scrape/content already proved exist.
 */
async function selectCurrentArticlesWithAi(
  env: Env,
  landingUrl: string,
  sourceName: string,
  date: string,
  cities: string[],
  candidates: CandidateLink[],
  stage:
    "scrape" |
    "content"
): Promise<{
  urls: string[];
  method: string;
  diagnostics: unknown;
}> {
  if (!candidates.length) {
    return {
      urls: [],
      method:
        `cf-${stage}-candidate-ai`,
      diagnostics: {
        candidates:0,
        selected:0
      }
    };
  }


  const prompt = `
Aşağıdaki linkler ${sourceName} sitesinin gerçek DOM'undan alınmış candidate linklerdir.

BUGÜN:
${date}

BUGÜNKÜ TJK TÜRKİYE YARIŞ ŞEHİRLERİ:
${cities.join(", ")}

Görevin yalnızca bu candidate linkler arasından BUGÜNÜN Türkiye at yarışı tahmin, analiz veya uzman yorum içeriğine götüren GERÇEK ARTICLE URL'lerini seçmektir.

Kurallar:
- Sana verilen listede olmayan URL üretme.
- Eski tarihli içerikleri seçme.
- Yurt dışı yarışlarını seçme.
- Genel haber, camia haberi, kategori, tag, uzman listesi, ana sayfa, reklam veya navigasyon linkini seçme.
- Bir article birden fazla bugünkü TJK şehrini kapsayabilir.
- URL slug'ı bozuk veya tarih formatı alışılmadık olabilir; anchor text ve URL'yi birlikte değerlendir.
- Emin olmadığın linki seçme.
- Hiçbiri uygun değilse urls=[] döndür.

Yalnızca gerçek current-card article URL'lerini döndür.
`.trim();


  const result =
    await extractSemanticJson<any>(
      env,

      /*
       * Important:
       * AI sees only this compact candidate document,
       * NOT the original noisy landing page.
       */
      `data:text/html,${encodeURIComponent(
        candidateHtml(
          candidates
        )
      )}`,

      prompt,

      {
        type:
          "json_schema",

        json_schema:
          discoverySchema
      }
    );


  const urls =
    normalizeSelectedUrls(
      landingUrl,
      result.value?.urls
    );


  /*
   * Defense against model hallucination:
   * selected URL must literally exist in candidate set.
   */
  const candidateSet =
    new Set(
      candidates.map(
        item =>
          normalizeUrl(
            landingUrl,
            item.url
          )
      )
    );


  const verified =
    urls.filter(
      url =>
        candidateSet.has(url)
    );


  return {
    urls:
      verified,

    method:
      `cf-${stage}-candidate-ai:${result.method}`,

    diagnostics: {
      candidates:
        candidates.length,

      selected:
        verified.length,

      selectedUrls:
        verified,

      semantic:
        result.diagnostics
    }
  };
}


/*
 * Last-resort legacy semantic discovery.
 *
 * This is intentionally LAST now.
 */
async function fullPageSemanticFallback(
  env: Env,
  landingUrl: string,
  sourceName: string,
  date: string,
  cities: string[]
): Promise<{
  urls: string[];
  method: string;
  diagnostics: unknown;
}> {
  const prompt = `
${sourceName} sitesinde ${date} tarihine ait Türkiye at yarışı tahmin yazılarının URL adreslerini bul.

BUGÜNKÜ TJK ŞEHİRLERİ:
${cities.join(", ")}

Yalnızca:
- bugünkü Türkiye yarışlarına,
- bu şehirlerden en az birine,
- gerçek tahmin / analiz / uzman yorum article'ına

götüren URL'leri seç.

Kategori, tag, ana sayfa, genel haber, reklam, sosyal medya, yurt dışı yarış veya eski tarihli içerik seçme.

Hiç uygun article yoksa urls=[] döndür.
`.trim();


  const result =
    await extractSemanticJson<any>(
      env,
      landingUrl,
      prompt,
      {
        type:
          "json_schema",

        json_schema:
          discoverySchema
      }
    );


  return {
    urls:
      normalizeSelectedUrls(
        landingUrl,
        result.value?.urls
      ),

    method:
      `full-page-semantic:${result.method}`,

    diagnostics:
      result.diagnostics
  };
}


export async function discoverExpertArticleUrls(
  env: Env,
  landingUrl: string,
  sourceName: string,
  cities: string[]
): Promise<{
  urls: string[];
  method: string;
  diagnostics: unknown;
}> {
  const date =
    turkeyDate();


  const diagnostics:
    any = {
      scrape:
        null,

      content:
        null,

      fullPageSemantic:
        null
    };


  /*
   * =====================================================
   * STAGE 1
   * Cloudflare SCRAPE -> real anchors -> AI selector
   * =====================================================
   */
  try {
    const scraped =
      await scrapeAnchorCandidates(
        env,
        landingUrl
      );


    const selected =
      await selectCurrentArticlesWithAi(
        env,
        landingUrl,
        sourceName,
        date,
        cities,
        scraped.candidates,
        "scrape"
      );


    diagnostics.scrape = {
      browserMs:
        scraped.browserMs,

      candidateCount:
        scraped.candidates.length,

      candidateSample:
        scraped.candidates.slice(
          0,
          20
        ),

      selection:
        selected.diagnostics
    };


    if (
      selected.urls.length > 0
    ) {
      return {
        urls:
          selected.urls,

        method:
          selected.method,

        diagnostics
      };
    }

  } catch (error) {
    diagnostics.scrape = {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }


  /*
   * =====================================================
   * STAGE 2
   * Cloudflare CONTENT -> anchors -> AI selector
   * =====================================================
   */
  try {
    const content =
      await acquireCfContentHtml(
        env,
        landingUrl
      );


    const candidates =
      anchorsFromHtml(
        landingUrl,
        content.html
      );


    const selected =
      await selectCurrentArticlesWithAi(
        env,
        landingUrl,
        sourceName,
        date,
        cities,
        candidates,
        "content"
      );


    diagnostics.content = {
      bodyLength:
        content.bodyLength,

      candidateCount:
        candidates.length,

      candidateSample:
        candidates.slice(
          0,
          20
        ),

      selection:
        selected.diagnostics
    };


    if (
      selected.urls.length > 0
    ) {
      return {
        urls:
          selected.urls,

        method:
          selected.method,

        diagnostics
      };
    }

  } catch (error) {
    diagnostics.content = {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    };
  }


  /*
   * =====================================================
   * STAGE 3
   * Legacy full-page AI discovery as final fallback.
   * =====================================================
   */
  try {
    const fallback =
      await fullPageSemanticFallback(
        env,
        landingUrl,
        sourceName,
        date,
        cities
      );


    diagnostics.fullPageSemantic = {
      method:
        fallback.method,

      selected:
        fallback.urls.length,

      urls:
        fallback.urls,

      acquisition:
        fallback.diagnostics
    };


    return {
      urls:
        fallback.urls,

      method:
        fallback.method,

      diagnostics
    };

  } catch (error) {
    diagnostics.fullPageSemantic = {
      error:
        error instanceof Error
          ? error.message
          : String(error)
    };


    return {
      urls: [],

      method:
        "discovery-exhausted",

      diagnostics
    };
  }
}
