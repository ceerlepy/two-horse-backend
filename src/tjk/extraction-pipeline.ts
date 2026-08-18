import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";

import {
  discoverDomesticMeetingNames,
  parseTjkMeetingPage,
  assertCompleteMeeting,
  assertCompleteProgram,
  type TjkMeeting
} from "./html-parser";

export type TjkStage =
  | "HTTP_FETCH"
  | "HTTP_PARSE"
  | "CF_SCRAPE"
  | "SCRAPE_PARSE"
  | "CF_CONTENT"
  | "CONTENT_PARSE"
  | "CF_JSON"
  | "JSON_VALIDATE";

export interface TjkDiagnostic {
  scope: string;
  stage: TjkStage;
  ok: boolean;
  durationMs: number;
  status?: number;
  error?: string;
  detail?: string;
}

export class TjkExtractionError extends Error {
  constructor(
    message: string,
    readonly diagnostics: TjkDiagnostic[]
  ) {
    super(message);
    this.name = "TjkExtractionError";
  }
}

const TJK_MASTER_URL =
  "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";

const HTTP_TIMEOUT_MS = 15_000;
const BROWSER_TIMEOUT_MS = 25_000;
const CITY_CONCURRENCY = 4;

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function turkeyDateParts(): {
  yyyyMMdd: string;
  ddMMyyyy: string;
} {
  const parts = new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(new Date());

  const value = (type: string) =>
    parts.find(part => part.type === type)?.value ?? "";

  const year = value("year");
  const month = value("month");
  const day = value("day");

  return {
    yyyyMMdd: `${year}-${month}-${day}`,
    ddMMyyyy: `${day}/${month}/${year}`
  };
}

function buildCityUrl(city: string): string {
  const { ddMMyyyy } = turkeyDateParts();

  const url = new URL(TJK_MASTER_URL);

  url.searchParams.set(
    "QueryParameter_Tarih",
    ddMMyyyy
  );

  url.searchParams.set(
    "SehirAdi",
    city
  );

  url.searchParams.set(
    "Era",
    "today"
  );

  return url.toString();
}

async function timed<T>(
  scope: string,
  stage: TjkStage,
  diagnostics: TjkDiagnostic[],
  work: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await work();

    diagnostics.push({
      scope,
      stage,
      ok: true,
      durationMs: Date.now() - startedAt
    });

    console.info(
      `[TJK] ${scope} ${stage} OK`
    );

    return result;
  } catch (error) {
    const message = errorText(error);

    diagnostics.push({
      scope,
      stage,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: message
    });

    console.warn(
      `[TJK] ${scope} ${stage} FAIL`,
      message
    );

    throw error;
  }
}

async function httpHtml(url: string): Promise<string> {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    HTTP_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "accept-language":
          "tr-TR,tr;q=0.9,en;q=0.7",

        "user-agent":
          "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/139.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status}:${url}`
      );
    }

    const html = await response.text();

    if (html.length < 1000) {
      throw new Error(
        `HTTP_HTML_TOO_SMALL:${html.length}`
      );
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapQuickAction(value: any): any {
  if (
    value &&
    typeof value === "object" &&
    "result" in value
  ) {
    return value.result;
  }

  return value;
}

function recursivelyFindHtml(value: any): string | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    typeof value.html === "string" &&
    value.html.length > 500
  ) {
    return value.html;
  }

  if (Array.isArray(value)) {
    for (const child of value) {
      const found = recursivelyFindHtml(child);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (typeof value === "object") {
    for (const child of Object.values(value)) {
      const found = recursivelyFindHtml(child);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function scrapeHtml(
  env: Env,
  url: string
): Promise<string> {
  const response = await env.BROWSER.quickAction(
    "scrape",
    {
      url,

      elements: [
        {
          selector: "body"
        }
      ],

      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: BROWSER_TIMEOUT_MS
      },

      rejectResourceTypes: [
        "image",
        "media",
        "font"
      ]
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `SCRAPE_${response.status}:${body.slice(0, 800)}`
    );
  }

  const payload = unwrapQuickAction(
    await response.json()
  ) as Record<string, unknown>;

  const rawCities: unknown[] =
    Array.isArray(payload.cities)
      ? payload.cities
      : [];

  const cities: string[] = [];

  for (const rawCity of rawCities) {
    const city = String(rawCity ?? "").trim();

    if (city && !cities.includes(city)) {
      cities.push(city);
    }
  }

  if (!cities.length) {
    throw new Error(
      "MASTER_JSON_NO_CITIES"
    );
  }

  diagnostics.push({
    scope,
    stage: "JSON_VALIDATE",
    ok: true,
    durationMs: 0,
    detail: `${cities.length} meetings`
  });

  return cities;
}

async function mapLimited<T, R>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;

      if (index >= values.length) {
        return;
      }

      results[index] =
        await work(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.max(
          1,
          Math.min(concurrency, values.length)
        )
      },
      () => worker()
    )
  );

  return results;
}

export async function extractTjkProgramWithFallbacks(
  env: Env,
  _registryUrl: string
): Promise<{
  program: TjkProgramInput;
  diagnostics: TjkDiagnostic[];
}> {
  const diagnostics: TjkDiagnostic[] = [];

  try {
    const cities = await discoverCities(
      env,
      diagnostics
    );

    const meetings = await mapLimited(
      cities,
      CITY_CONCURRENCY,
      city =>
        meetingThroughFourStages(
          env,
          city,
          diagnostics
        )
    );

    const program: TjkProgramInput = {
      meetings
    };

    assertCompleteProgram(program);

    return {
      program,
      diagnostics
    };
  } catch (error) {
    throw new TjkExtractionError(
      errorText(error),
      diagnostics
    );
  }
}
