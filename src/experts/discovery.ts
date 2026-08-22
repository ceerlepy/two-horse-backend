import type {
  Env
} from "../env";

import {
  extractSemanticJson
} from "../acquisition/semantic-json";

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


function sameHost(
  a: string,
  b: string
): boolean {
  try {
    return (
      new URL(a).hostname
        .replace(/^www\./,"") ===
      new URL(b).hostname
        .replace(/^www\./,"")
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


  const prompt = `
${sourceName} sitesinde ${date} tarihine ait Türkiye at yarışı tahmin yazılarının URL adreslerini bul.

HEDEF ŞEHİRLER:
${cities.join(", ")}

Bu sayfa bir ana sayfa, kategori, etiket, uzman listesi veya arşiv sayfası olabilir.

Yalnızca:
- ${date} tarihli,
- Türkiye yarışlarına ait,
- hedef şehirlerden en az birine ait,
- gerçek tahmin/yorum makalesine götüren
URL'leri urls listesine koy.

Makale olmayan kategori, ana sayfa, reklam, sosyal medya, yurt dışı yarış ve eski tarih linklerini alma.

Göreli link varsa tam URL olarak çöz.

Hiç uygun makale yoksa urls boş array olsun.
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


  const raw =
    Array.isArray(
      result.value?.urls
    )
      ? result.value.urls
      : [];


  const output:
    string[] = [];

  const seen =
    new Set<string>();


  for (const item of raw) {
    const url =
      normalizeUrl(
        landingUrl,
        String(item)
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


  return {
    urls:
      output.slice(0,12),

    method:
      result.method,

    diagnostics:
      result.diagnostics
  };
}
