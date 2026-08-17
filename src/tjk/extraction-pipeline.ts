import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";

import {
  discoverDomesticMeetings,
  parseTjkMeetingPage,
  assertCompleteMeeting,
  assertCompleteProgram
} from "./html-parser";

import {
  tjkMeetingJsonSchema
} from "./schema";

type Meeting =
  TjkProgramInput["meetings"][number];

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

export class TjkExtractionError
  extends Error {
  constructor(
    message: string,
    readonly diagnostics:
      TjkDiagnostic[]
  ) {
    super(message);
    this.name =
      "TjkExtractionError";
  }
}

const FETCH_TIMEOUT_MS =
  15_000;

function errorText(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

async function timed<T>(
  scope: string,
  stage: TjkStage,
  diagnostics:
    TjkDiagnostic[],
  work: () => Promise<T>
): Promise<T> {
  const started = Date.now();

  try {
    const value =
      await work();

    diagnostics.push({
      scope,
      stage,
      ok: true,
      durationMs:
        Date.now() - started
    });

    console.info(
      `[TJK] ${scope} ${stage} OK`
    );

    return value;
  } catch (error) {
    const message =
      errorText(error);

    diagnostics.push({
      scope,
      stage,
      ok: false,
      durationMs:
        Date.now() - started,
      error: message
    });

    console.warn(
      `[TJK] ${scope} ${stage} FAIL`,
      message
    );

    throw error;
  }
}

async function httpFetchHtml(
  url: string
): Promise<string> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      FETCH_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(url, {
        headers: {
          "accept":
            "text/html,application/xhtml+xml",

          "user-agent":
            "Mozilla/5.0 (compatible; TwoHorse/1.0)"
        },

        signal:
          controller.signal
      });

    if (!response.ok) {
      throw new Error(
        `HTTP_${response.status}`
      );
    }

    const html =
      await response.text();

    if (
      html.length < 1000
    ) {
      throw new Error(
        `HTML_TOO_SMALL:${html.length}`
      );
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapQuickAction(
  body: any
): any {
  if (
    body &&
    typeof body === "object" &&
    "result" in body
  ) {
    return body.result;
  }

  return body;
}

function scrapeBodyHtml(
  payload: any
): string {
  const raw =
    unwrapQuickAction(
      payload
    );

  const groups =
    Array.isArray(raw)
      ? raw
      : [];

  for (
    const group of groups
  ) {
    if (
      group?.selector !==
      "body"
    ) {
      continue;
    }

    const first =
      Array.isArray(
        group.results
      )
        ? group.results[0]
        : null;

    if (
      typeof first?.html ===
        "string" &&
      first.html.length
    ) {
      return (
        "<body>" +
        first.html +
        "</body>"
      );
    }
  }

  throw new Error(
    "SCRAPE_BODY_NOT_FOUND"
  );
}

async function browserScrapeHtml(
  env: Env,
  url: string
): Promise<string> {
  const response =
    await (env.BROWSER as any)
      .quickAction(
        "scrape",
        {
          url,

          elements: [
            {
              selector:
                "body"
            }
          ],

          gotoOptions: {
            waitUntil:
              "networkidle2",
            timeout:
              20_000
          },

          rejectResourceTypes: [
            "image",
            "media",
            "font"
          ]
        }
      );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `SCRAPE_HTTP_${response.status}:${body.slice(0, 500)}`
    );
  }

  return scrapeBodyHtml(
    await response.json()
  );
}

async function browserContentHtml(
  env: Env,
  url: string
): Promise<string> {
  const response =
    await (env.BROWSER as any)
      .quickAction(
        "content",
        {
          url,

          gotoOptions: {
            waitUntil:
              "networkidle2",
            timeout:
              20_000
          },

          rejectResourceTypes: [
            "image",
            "media",
            "font"
          ]
        }
      );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `CONTENT_HTTP_${response.status}:${body.slice(0, 500)}`
    );
  }

  const html =
    await response.text();

  if (
    html.length < 1000
  ) {
    throw new Error(
      `CONTENT_TOO_SMALL:${html.length}`
    );
  }

  return html;
}

function nullableString(
  value: unknown
): string | null {
  const text =
    String(value ?? "")
      .trim();

  return text || null;
}

function nullableNumber(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(
      String(value)
        .replace(",", ".")
    );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function nullableInteger(
  value: unknown
): number | null {
  const parsed =
    nullableNumber(value);

  return parsed == null
    ? null
    : Math.trunc(parsed);
}

function normalizeAiMeeting(
  payload: any,
  expectedCity: string
): Meeting {
  const raw =
    unwrapQuickAction(
      payload
    );

  const city =
    nullableString(
      raw?.city
    ) ??
    expectedCity;

  const races =
    Array.isArray(raw?.races)
      ? raw.races
      : [];

  return {
    city,

    races:
      races.map(
        (race: any) => ({
          raceNumber:
            Number(
              race?.raceNumber
            ),

          time:
            String(
              race?.time ?? ""
            )
              .replace(".", ":")
              .trim(),

          distanceMeters:
            nullableInteger(
              race?.distanceMeters
            ),

          track:
            nullableString(
              race?.track
            ),

          runners:
            Array.isArray(
              race?.runners
            )
              ? race.runners.map(
                  (
                    runner: any
                  ) => ({
                    number:
                      Number(
                        runner?.number
                      ),

                    name:
                      String(
                        runner?.name ??
                        ""
                      ).trim(),

                    jockey:
                      nullableString(
                        runner?.jockey
                      ),

                    weight:
                      nullableNumber(
                        runner?.weight
                      ),

                    hp:
                      nullableInteger(
                        runner?.hp
                      ),

                    agfPercent:
                      nullableNumber(
                        runner?.agfPercent
                      )
                  })
                )
              : []
        })
      )
  };
}

async function browserJsonMeeting(
  env: Env,
  url: string,
  city: string
): Promise<Meeting> {
  const response =
    await (env.BROWSER as any)
      .quickAction(
        "json",
        {
          url,

          prompt: `
This is an official Turkish Jockey Club city race-program page.

Extract ONLY the domestic meeting shown on this page.

Expected city: ${city}

Return every race and every listed runner.

Rules:
- raceNumber is the actual race number.
- time is the visible race start time in HH:mm format.
- runners contains every horse listed in that race.
- runner number and horse name are mandatory.
- jockey, weight, HP and AGF should be extracted when visible.
- do not invent missing values.
- do not omit races.
- do not omit runners.
`,

          response_format: {
            type:
              "json_schema",

            json_schema:
              tjkMeetingJsonSchema
          },

          gotoOptions: {
            waitUntil:
              "networkidle2",

            timeout:
              25_000
          },

          rejectResourceTypes: [
            "image",
            "media",
            "font"
          ]
        }
      );

  if (!response.ok) {
    /*
     * 422 gibi hatalarda Cloudflare'ın
     * GERÇEK response body’si logda kalır.
     */
    const body =
      await response.text();

    throw new Error(
      `CF_JSON_HTTP_${response.status}:${body.slice(0, 1200)}`
    );
  }

  const payload =
    await response.json();

  return normalizeAiMeeting(
    payload,
    city
  );
}

async function extractMeeting(
  env: Env,
  city: string,
  url: string,
  diagnostics:
    TjkDiagnostic[]
): Promise<Meeting> {
  const scope =
    `meeting:${city}`;

  /*
   * 1. NORMAL HTTP FETCH
   */
  try {
    const html =
      await timed(
        scope,
        "HTTP_FETCH",
        diagnostics,
        () =>
          httpFetchHtml(url)
      );

    return await timed(
      scope,
      "HTTP_PARSE",
      diagnostics,
      async () => {
        const meeting =
          parseTjkMeetingPage(
            html,
            city
          );

        assertCompleteMeeting(
          meeting
        );

        return meeting;
      }
    );
  } catch {
    // stage 2
  }

  /*
   * 2. CLOUDFLARE /SCRAPE
   */
  try {
    const html =
      await timed(
        scope,
        "CF_SCRAPE",
        diagnostics,
        () =>
          browserScrapeHtml(
            env,
            url
          )
      );

    return await timed(
      scope,
      "SCRAPE_PARSE",
      diagnostics,
      async () => {
        const meeting =
          parseTjkMeetingPage(
            html,
            city
          );

        assertCompleteMeeting(
          meeting
        );

        return meeting;
      }
    );
  } catch {
    // stage 3
  }

  /*
   * 3. CLOUDFLARE /CONTENT
   */
  try {
    const html =
      await timed(
        scope,
        "CF_CONTENT",
        diagnostics,
        () =>
          browserContentHtml(
            env,
            url
          )
      );

    return await timed(
      scope,
      "CONTENT_PARSE",
      diagnostics,
      async () => {
        const meeting =
          parseTjkMeetingPage(
            html,
            city
          );

        assertCompleteMeeting(
          meeting
        );

        return meeting;
      }
    );
  } catch {
    // stage 4
  }

  /*
   * 4. CLOUDFLARE /JSON
   * En son fallback.
   */
  const meeting =
    await timed(
      scope,
      "CF_JSON",
      diagnostics,
      () =>
        browserJsonMeeting(
          env,
          url,
          city
        )
    );

  return await timed(
    scope,
    "JSON_VALIDATE",
    diagnostics,
    async () => {
      assertCompleteMeeting(
        meeting
      );

      return meeting;
    }
  );
}

async function discoverMasterMeetings(
  env: Env,
  inputUrl: string,
  diagnostics: TjkDiagnostic[]
): Promise<Array<{
  city: string;
  url: string;
}>> {
  /*
   * TJK canonical daily-program page.
   *
   * Query/Page occasionally returns a shell/partial page with HTTP 200.
   * HTTP 200 alone is NOT success. Meeting discovery must also succeed.
   */
  const canonicalUrl = inputUrl
    .replace(
      /\/Query\/Page\/GunlukYarisProgrami/i,
      "/Info/Page/GunlukYarisProgrami"
    );

  const scope = "master";

  /*
   * 1) NORMAL HTTP
   * Fetch + discovery together form one successful stage.
   */
  try {
    const html = await timed(
      scope,
      "HTTP_FETCH",
      diagnostics,
      () => httpFetchHtml(canonicalUrl)
    );

    const meetings = discoverDomesticMeetings(
      html,
      canonicalUrl
    );

    if (!meetings.length) {
      diagnostics.push({
        scope,
        stage: "HTTP_PARSE",
        ok: false,
        durationMs: 0,
        error: "NO_DOMESTIC_MEETINGS"
      });

      console.warn(
        "[TJK] master HTTP_PARSE FAIL NO_DOMESTIC_MEETINGS"
      );

      throw new Error(
        "HTTP_MASTER_NO_DOMESTIC_MEETINGS"
      );
    }

    diagnostics.push({
      scope,
      stage: "HTTP_PARSE",
      ok: true,
      durationMs: 0,
      detail: `${meetings.length} meetings`
    });

    console.info(
      `[TJK] master HTTP_PARSE OK ${meetings.length} meetings`
    );

    return meetings;
  } catch {
    // continue to Cloudflare scrape
  }

  /*
   * 2) CLOUDFLARE /SCRAPE
   */
  try {
    const html = await timed(
      scope,
      "CF_SCRAPE",
      diagnostics,
      () => browserScrapeHtml(
        env,
        canonicalUrl
      )
    );

    const meetings = discoverDomesticMeetings(
      html,
      canonicalUrl
    );

    if (!meetings.length) {
      diagnostics.push({
        scope,
        stage: "SCRAPE_PARSE",
        ok: false,
        durationMs: 0,
        error: "NO_DOMESTIC_MEETINGS"
      });

      console.warn(
        "[TJK] master SCRAPE_PARSE FAIL NO_DOMESTIC_MEETINGS"
      );

      throw new Error(
        "SCRAPE_MASTER_NO_DOMESTIC_MEETINGS"
      );
    }

    diagnostics.push({
      scope,
      stage: "SCRAPE_PARSE",
      ok: true,
      durationMs: 0,
      detail: `${meetings.length} meetings`
    });

    console.info(
      `[TJK] master SCRAPE_PARSE OK ${meetings.length} meetings`
    );

    return meetings;
  } catch {
    // continue to rendered content
  }

  /*
   * 3) CLOUDFLARE /CONTENT
   */
  const html = await timed(
    scope,
    "CF_CONTENT",
    diagnostics,
    () => browserContentHtml(
      env,
      canonicalUrl
    )
  );

  const meetings = discoverDomesticMeetings(
    html,
    canonicalUrl
  );

  if (!meetings.length) {
    diagnostics.push({
      scope,
      stage: "CONTENT_PARSE",
      ok: false,
      durationMs: 0,
      error: "NO_DOMESTIC_MEETINGS"
    });

    throw new Error(
      "CONTENT_MASTER_NO_DOMESTIC_MEETINGS"
    );
  }

  diagnostics.push({
    scope,
    stage: "CONTENT_PARSE",
    ok: true,
    durationMs: 0,
    detail: `${meetings.length} meetings`
  });

  console.info(
    `[TJK] master CONTENT_PARSE OK ${meetings.length} meetings`
  );

  return meetings;
}

async function mapLimited<
  T,
  R
>(
  values: T[],
  concurrency: number,
  work:
    (value: T) =>
      Promise<R>
): Promise<R[]> {
  const result:
    R[] =
      new Array(
        values.length
      );

  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;

      if (
        index >=
        values.length
      ) {
        return;
      }

      result[index] =
        await work(
          values[index]
        );
    }
  }

  const count =
    Math.max(
      1,
      Math.min(
        concurrency,
        values.length
      )
    );

  await Promise.all(
    Array.from(
      { length: count },
      () => worker()
    )
  );

  return result;
}

export async function extractTjkProgramWithFallbacks(
  env: Env,
  masterUrl: string
): Promise<{
  program: TjkProgramInput;
  diagnostics:
    TjkDiagnostic[];
}> {
  const diagnostics:
    TjkDiagnostic[] = [];

  try {
    const meetings =
      await discoverMasterMeetings(
        env,
        masterUrl,
        diagnostics
      );

    /*
     * Paid planı ekonomik kullanmak için
     * kontrollü concurrency.
     *
     * Her meeting kendi 4-stage fallback zincirini yürütür.
     */
    const parsed =
      await mapLimited(
        meetings,
        4,
        meeting =>
          extractMeeting(
            env,
            meeting.city,
            meeting.url,
            diagnostics
          )
      );

    const program:
      TjkProgramInput = {
        meetings: parsed
      };

    assertCompleteProgram(
      program
    );

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
