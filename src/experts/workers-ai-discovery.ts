import type {
  Env
} from "../env";

import {
  DEFAULT_EXPERT_AI_MODEL
} from "./workers-ai-extraction";


const DISCOVERY_MAX_OUTPUT_TOKENS =
  2048;


const schema = {
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


export interface DiscoveryCandidateInput {
  url:
    string;

  text:
    string;

  score:
    number;
}


function parseResponse(
  raw:
    unknown
): string[] {
  const envelope =
    raw as any;


  let value:any =
    (
      envelope &&
      typeof envelope ===
        "object" &&
      "response" in envelope
    )
      ? envelope.response
      : raw;


  if (
    typeof value ===
      "string"
  ) {
    value =
      JSON.parse(value);
  }


  if (
    !value ||
    typeof value !==
      "object" ||
    !Array.isArray(
      value.urls
    )
  ) {
    throw new Error(
      "WORKERS_AI_DISCOVERY_INVALID_RESPONSE"
    );
  }


  return value.urls
    .map(
      (item:unknown) =>
        String(item)
          .trim()
    )
    .filter(Boolean);
}


export async function selectExpertCandidateUrlsWithWorkersAi(
  env:
    Env,

  input: {
    sourceName:
      string;

    raceDate:
      string;

    cities:
      string[];

    candidates:
      DiscoveryCandidateInput[];
  }
) {
  const model =
    String(
      env.AI_MODEL ??
      DEFAULT_EXPERT_AI_MODEL
    );


  const candidatePayload =
    input.candidates
      .map(
        (
          candidate,
          index
        ) =>
          [
            `${index + 1}.`,
            `URL=${candidate.url}`,
            `SCORE=${candidate.score}`,
            `CONTEXT=${candidate.text.slice(0,700)}`
          ].join(" ")
      )
      .join("\n");


  const prompt = `
${input.sourceName} sitesi için current Türkiye at yarışı
expert article URL'lerini seç.

HEDEF TARİH:
${input.raceDate}

HEDEF TJK ŞEHİRLERİ:
${input.cities.join(", ")}

Aşağıdaki liste application tarafından önceden HARD FILTER
edilmiştir:

- same host
- hedef tarih evidence
- hedef şehir evidence
- prediction/analysis evidence
- utility ve negative content reddi

Sen yalnız gerçekten expert prediction / analysis article olan
URL'leri seç.

Kurallar:

- Listede olmayan URL üretme.
- Haber, sakatlık, koşmayacak at haberi seçme.
- Kombine bahis yazısını expert tahmin article sanma.
- Yurt dışı article seçme.
- Kategori/navigation URL seçme.
- Aynı gün farklı gerçek şehir/article varsa hepsini koru.
- Şüpheli article'ı seçme.

CANDIDATES:

${candidatePayload}

Yalnız JSON schema data döndür.
`.trim();


  const raw:any =
    await env.AI.run(
      model as any,
      {
        messages: [
          {
            role:
              "system",

            content:
              "Select only current verified horse-racing expert article URLs from the supplied candidate set. Never invent a URL."
          },

          {
            role:
              "user",

            content:
              prompt
          }
        ],

        response_format: {
          type:
            "json_schema",

          json_schema:
            schema
        },

        max_tokens:
          DISCOVERY_MAX_OUTPUT_TOKENS,

        temperature:
          0
      } as any
    );


  return {
    urls:
      parseResponse(raw),

    diagnostics: {
      model,

      maxTokens:
        DISCOVERY_MAX_OUTPUT_TOKENS,

      usage:
        raw?.usage ??
        null
    }
  };
}
