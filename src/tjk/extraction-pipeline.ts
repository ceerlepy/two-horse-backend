import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";

import {
  discoverDomesticMeetingNames,
  discoverDomesticMeetingLinks,
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

interface HttpHtmlResult {
  html: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  bodyLength: number;
}

async function httpHtml(url: string): Promise<HttpHtmlResult> {
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

    return {
      html,
      requestedUrl: url,
      finalUrl: response.url || url,
      status: response.status,
      contentType:
        response.headers.get("content-type") ?? "",
      bodyLength: html.length
    };
  } finally {
    clearTimeout(timeout);
  }
}

function annotateDiagnostic(
  diagnostics: TjkDiagnostic[],
  scope: string,
  stage: TjkStage,
  update: Partial<TjkDiagnostic>
): void {
  for (let index = diagnostics.length - 1; index >= 0; index--) {
    const diagnostic = diagnostics[index];

    if (
      diagnostic.scope === scope &&
      diagnostic.stage === stage &&
      diagnostic.ok
    ) {
      Object.assign(diagnostic, update);
      return;
    }
  }
}

function httpDiagnosticDetail(
  result: HttpHtmlResult
): string {
  return [
    `requestedUrl=${result.requestedUrl}`,
    `finalUrl=${result.finalUrl}`,
    `contentType=${result.contentType || "unknown"}`,
    `bodyLength=${result.bodyLength}`
  ].join(" ");
}

function meetingDiagnosticDetail(
  meeting: TjkMeeting
): string {
  const runnerCount = meeting.races.reduce(
    (total, race) =>
      total + race.runners.length,
    0
  );

  return [
    `raceCount=${meeting.races.length}`,
    `runnerCount=${runnerCount}`
  ].join(" ");
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
  );

  const html = recursivelyFindHtml(payload);

  if (!html) {
    throw new Error(
      "SCRAPE_HTML_NOT_FOUND"
    );
  }

  return `<body>${html}</body>`;
}

async function contentHtml(
  env: Env,
  url: string
): Promise<string> {
  const response = await env.BROWSER.quickAction(
    "content",
    {
      url,

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
      `CONTENT_${response.status}:${body.slice(0, 800)}`
    );
  }

  const html = await response.text();

  if (html.length < 1000) {
    throw new Error(
      `CONTENT_TOO_SMALL:${html.length}`
    );
  }

  return html;
}

function normalizeJsonMeeting(
  payload: any,
  expectedCity: string
): TjkMeeting {
  const raw = unwrapQuickAction(payload);

  const races = Array.isArray(raw?.races)
    ? raw.races
    : [];

  return {
    city:
      String(raw?.city ?? expectedCity).trim() ||
      expectedCity,

    races: races.map((race: any) => ({
      raceNumber:
        Number(race?.raceNumber),

      time:
        String(race?.time ?? "")
          .replace(".", ":")
          .trim(),

      distanceMeters:
        race?.distanceMeters == null
          ? null
          : Number(race.distanceMeters),

      track:
        race?.track == null
          ? null
          : String(race.track),

      runners:
        Array.isArray(race?.runners)
          ? race.runners.map((runner: any) => ({
              number:
                Number(runner?.number),

              name:
                String(runner?.name ?? "").trim(),

              jockey:
                runner?.jockey == null
                  ? null
                  : String(runner.jockey).trim() || null,

              weight:
                runner?.weight == null
                  ? null
                  : Number(runner.weight),

              hp:
                runner?.hp == null
                  ? null
                  : Math.trunc(Number(runner.hp)),

              agfPercent:
                runner?.agfPercent == null
                  ? null
                  : Number(runner.agfPercent)
            }))
          : []
    }))
  };
}

/**
 * /json is the LAST resort.
 *
 * Prompt-only mode is intentional:
 * Browser Run docs support prompt OR response_format.
 * Semantic validation is performed by our own validator.
 */
async function jsonMeeting(
  env: Env,
  city: string,
  url: string
): Promise<TjkMeeting> {
  const response = await env.BROWSER.quickAction(
    "json",
    {
      url,

      prompt: `
Read this official Turkish Jockey Club daily race program for ${city}.

Return JSON in this exact logical shape:

{
  "city": "${city}",
  "races": [
    {
      "raceNumber": 1,
      "time": "HH:mm",
      "distanceMeters": 1200,
      "track": "Kum",
      "runners": [
        {
          "number": 1,
          "name": "HORSE NAME",
          "jockey": "JOCKEY NAME",
          "weight": 58,
          "hp": 70,
          "agfPercent": 25.4
        }
      ]
    }
  ]
}

Requirements:
- extract EVERY race displayed for ${city}
- extract EVERY listed runner
- use the real visible race start time
- do not invent horses
- do not omit horses
- keep horse number and horse name paired correctly
- use null for optional fields only when not shown
- time must be HH:mm
`
    }
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `CF_JSON_HTTP_${response.status}:${body.slice(0, 1200)}`
    );
  }

  return normalizeJsonMeeting(
    await response.json(),
    city
  );
}

async function meetingThroughFourStages(
  env: Env,
  city: string,
  url: string,
  diagnostics: TjkDiagnostic[]
): Promise<TjkMeeting> {
  const scope = `meeting:${city}`;

  /*
   * 1. ordinary HTTP
   */
  try {
    const httpResult = await timed(
      scope,
      "HTTP_FETCH",
      diagnostics,
      () => httpHtml(url)
    );

    annotateDiagnostic(
      diagnostics,
      scope,
      "HTTP_FETCH",
      {
        status: httpResult.status,
        detail:
          httpDiagnosticDetail(httpResult)
      }
    );

    const meeting = await timed(
      scope,
      "HTTP_PARSE",
      diagnostics,
      async () => {
        const parsed =
          parseTjkMeetingPage(
            httpResult.html,
            city
          );

        assertCompleteMeeting(parsed);
        return parsed;
      }
    );

    annotateDiagnostic(
      diagnostics,
      scope,
      "HTTP_PARSE",
      {
        detail:
          meetingDiagnosticDetail(meeting)
      }
    );

    return meeting;
  } catch {
    // next stage
  }

  /*
   * 2. Cloudflare /scrape
   */
  try {
    const html = await timed(
      scope,
      "CF_SCRAPE",
      diagnostics,
      () => scrapeHtml(env, url)
    );

    return await timed(
      scope,
      "SCRAPE_PARSE",
      diagnostics,
      async () => {
        const meeting =
          parseTjkMeetingPage(html, city);

        assertCompleteMeeting(meeting);
        return meeting;
      }
    );
  } catch {
    // next stage
  }

  /*
   * 3. Cloudflare /content
   */
  try {
    const html = await timed(
      scope,
      "CF_CONTENT",
      diagnostics,
      () => contentHtml(env, url)
    );

    return await timed(
      scope,
      "CONTENT_PARSE",
      diagnostics,
      async () => {
        const meeting =
          parseTjkMeetingPage(html, city);

        assertCompleteMeeting(meeting);
        return meeting;
      }
    );
  } catch {
    // next stage
  }

  /*
   * 4. Cloudflare /json AI fallback
   */
  const meeting = await timed(
    scope,
    "CF_JSON",
    diagnostics,
    () => jsonMeeting(env, city, url)
  );

  return await timed(
    scope,
    "JSON_VALIDATE",
    diagnostics,
    async () => {
      assertCompleteMeeting(meeting);
      return meeting;
    }
  );
}

function meetingsFromMasterHtml(
  html: string
): Array<{ city: string; url: string }> {
  const links =
    discoverDomesticMeetingLinks(
      html,
      TJK_MASTER_URL
    );

  if (links.length) {
    return links;
  }

  return discoverDomesticMeetingNames(html)
    .map(city => ({
      city,
      url: buildCityUrl(city)
    }));
}

async function discoverMeetings(
  env: Env,
  diagnostics: TjkDiagnostic[]
): Promise<Array<{ city: string; url: string }>> {
  const scope = "master";

  /*
   * Stage 1
   */
  try {
    const httpResult = await timed(
      scope,
      "HTTP_FETCH",
      diagnostics,
      () => httpHtml(TJK_MASTER_URL)
    );

    annotateDiagnostic(
      diagnostics,
      scope,
      "HTTP_FETCH",
      {
        status: httpResult.status,
        detail:
          httpDiagnosticDetail(httpResult)
      }
    );

    const meetings =
      meetingsFromMasterHtml(
        httpResult.html
      );

    if (!meetings.length) {
      throw new Error(
        "NO_DOMESTIC_MEETINGS"
      );
    }

    diagnostics.push({
      scope,
      stage: "HTTP_PARSE",
      ok: true,
      durationMs: 0,
      detail:
        `meetingCount=${meetings.length}`
    });

    return meetings;
  } catch (error) {
    diagnostics.push({
      scope,
      stage: "HTTP_PARSE",
      ok: false,
      durationMs: 0,
      error: errorText(error)
    });
  }

  /*
   * Stage 2
   */
  try {
    const html = await timed(
      scope,
      "CF_SCRAPE",
      diagnostics,
      () => scrapeHtml(env, TJK_MASTER_URL)
    );

    const meetings =
      meetingsFromMasterHtml(html);

    if (!meetings.length) {
      throw new Error(
        "NO_DOMESTIC_MEETINGS"
      );
    }

    diagnostics.push({
      scope,
      stage: "SCRAPE_PARSE",
      ok: true,
      durationMs: 0,
      detail:
        `meetingCount=${meetings.length}`
    });

    return meetings;
  } catch (error) {
    diagnostics.push({
      scope,
      stage: "SCRAPE_PARSE",
      ok: false,
      durationMs: 0,
      error: errorText(error)
    });
  }

  /*
   * Stage 3
   */
  try {
    const html = await timed(
      scope,
      "CF_CONTENT",
      diagnostics,
      () => contentHtml(env, TJK_MASTER_URL)
    );

    const meetings =
      meetingsFromMasterHtml(html);

    if (!meetings.length) {
      throw new Error(
        "NO_DOMESTIC_MEETINGS"
      );
    }

    diagnostics.push({
      scope,
      stage: "CONTENT_PARSE",
      ok: true,
      durationMs: 0,
      detail:
        `meetingCount=${meetings.length}`
    });

    return meetings;
  } catch (error) {
    diagnostics.push({
      scope,
      stage: "CONTENT_PARSE",
      ok: false,
      durationMs: 0,
      error: errorText(error)
    });
  }

  /*
   * Stage 4: master JSON.
   * Unlike the old architecture, JSON is reachable even if city
   * discovery failed in stages 1-3.
   */
  const response = await timed(
    scope,
    "CF_JSON",
    diagnostics,
    () =>
      env.BROWSER.quickAction(
        "json",
        {
          url: TJK_MASTER_URL,

          prompt: `
Read the official Turkish Jockey Club daily race-program page.

Return JSON exactly like:
{
  "cities": ["Ankara", "Bursa"]
}

Include ONLY today's domestic Turkish race meetings.
Exclude every foreign/YD meeting.
Do not invent cities.
`
        }
      )
  );

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `MASTER_JSON_${response.status}:${body.slice(0, 1200)}`
    );
  }

  const payload = unwrapQuickAction(
    await response.json()
  );

  const cities = Array.isArray(payload?.cities)
    ? payload.cities
        .map((city: unknown) => String(city).trim())
        .filter(Boolean)
    : [];

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

  const normalizedCities: string[] = Array.from(
    new Set<string>(
      (cities as unknown[])
        .map((city: unknown): string => String(city ?? "").trim())
        .filter((city: string): boolean => city.length > 0)
    )
  );

  return normalizedCities.map(city => ({
    city,
    url: buildCityUrl(city)
  }));
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
    const discoveredMeetings =
      await discoverMeetings(
        env,
        diagnostics
      );

    const meetings = await mapLimited(
      discoveredMeetings,
      CITY_CONCURRENCY,
      discovered =>
        meetingThroughFourStages(
          env,
          discovered.city,
          discovered.url,
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
