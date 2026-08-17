import type { Env } from "../env";
import type { TjkProgramInput } from "../types/models";

import {
  errorMessage,
  sha256,
  unwrapQuickActionJson
} from "../shared";

import {
  getState,
  isDue,
  acquireLease,
  markFailure,
  markSuccess
} from "../storage/state";

import {
  upsertProgram
} from "../storage/program-repository";

import {
  getTjkProgramUrl,
  rediscoverTjkProgramUrl
} from "./registry";

import { tjkProgramSchema } from "./schema";

import {
  discoverDomesticMeetings,
  parseTjkMeetingPage,
  assertCompleteProgram
} from "./html-parser";

const KEY = "tjk:program";
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;
const CITY_CONCURRENCY = 4;

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; TwoHorse/1.0; +https://workers.dev)",
        "accept":
          "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `HTTP_FETCH_${response.status}:${url}`
      );
    }

    const html = await response.text();

    if (html.length < 1000) {
      throw new Error(`HTTP_HTML_TOO_SMALL:${url}`);
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function browserContent(
  env: Env,
  url: string
): Promise<string> {
  const response = await (env.BROWSER as any).quickAction(
    "content",
    {
      url,
      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 20000
      },
      rejectResourceTypes: [
        "image",
        "media",
        "font"
      ]
    }
  );

  if (!response.ok) {
    throw new Error(
      `BROWSER_CONTENT_${response.status}:${url}`
    );
  }

  return await response.text();
}

async function htmlWithFallback(
  env: Env,
  url: string
): Promise<{
  html: string;
  method: "fetch" | "browser-content";
}> {
  try {
    return {
      html: await fetchHtml(url),
      method: "fetch"
    };
  } catch {
    return {
      html: await browserContent(env, url),
      method: "browser-content"
    };
  }
}

async function aiJsonFallback(
  env: Env,
  url: string
): Promise<TjkProgramInput> {
  const response = await (env.BROWSER as any).quickAction(
    "json",
    {
      url,

      prompt: `
Extract the COMPLETE official Turkish Jockey Club daily
race program visible on this page.

Return every domestic meeting, every race and every runner.

For every race:
- raceNumber = actual race number.
- time = actual start time in HH:mm.
- never return null for time.
- runners must include every listed horse.
- runner number and name are mandatory.
- extract jockey, weight, HP and AGF where present.
- use null only when optional runner data is genuinely absent.
- never invent data.
`,

      response_format: {
        type: "json_schema",
        json_schema: tjkProgramSchema
      },

      gotoOptions: {
        waitUntil: "networkidle2",
        timeout: 25000
      },

      rejectResourceTypes: [
        "image",
        "media",
        "font"
      ]
    }
  );

  if (!response.ok) {
    throw new Error(
      `TJK_JSON_${response.status}`
    );
  }

  const payload = unwrapQuickActionJson(
    await response.json()
  ) as TjkProgramInput;

  assertCompleteProgram(payload);

  return payload;
}

async function mapLimited<T, R>(
  values: T[],
  limit: number,
  fn: (value: T) => Promise<R>
): Promise<R[]> {
  const result: R[] = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= values.length) return;

      result[index] = await fn(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, values.length) },
      () => worker()
    )
  );

  return result;
}

async function deterministicProgram(
  env: Env,
  masterUrl: string
): Promise<TjkProgramInput> {
  const master = await htmlWithFallback(
    env,
    masterUrl
  );

  const meetings = discoverDomesticMeetings(
    master.html,
    masterUrl
  );

  if (!meetings.length) {
    throw new Error("TJK_MASTER_NO_DOMESTIC_MEETINGS");
  }

  const parsed = await mapLimited(
    meetings,
    CITY_CONCURRENCY,
    async ({ city, url }) => {
      // First: ordinary HTTP.
      try {
        const html = await fetchHtml(url);
        const meeting = parseTjkMeetingPage(
          html,
          city
        );

        if (
          meeting.races.length &&
          meeting.races.every(
            race =>
              race.time &&
              race.runners.length > 0
          )
        ) {
          return meeting;
        }
      } catch {
        // continue to rendered HTML
      }

      // Second: browser-rendered HTML, still deterministic.
      const html = await browserContent(
        env,
        url
      );

      const meeting = parseTjkMeetingPage(
        html,
        city
      );

      if (
        !meeting.races.length ||
        meeting.races.some(
          race =>
            !race.time ||
            !race.runners.length
        )
      ) {
        throw new Error(
          `TJK_CITY_PARSE_INCOMPLETE:${city}`
        );
      }

      return meeting;
    }
  );

  const program: TjkProgramInput = {
    meetings: parsed
  };

  assertCompleteProgram(program);

  return program;
}

async function extractProgram(
  env: Env,
  url: string
): Promise<TjkProgramInput> {
  try {
    // PRIMARY:
    // HTTP / rendered HTML -> deterministic parser.
    return await deterministicProgram(
      env,
      url
    );
  } catch (deterministicError) {
    console.warn(
      "tjk deterministic extraction failed",
      errorMessage(deterministicError)
    );

    // LAST RESORT:
    // AI /json.
    return await aiJsonFallback(
      env,
      url
    );
  }
}

export async function refreshProgramIfDue(
  env: Env,
  force = false
): Promise<{
  refreshed: boolean;
  reason: string;
}> {
  const state = await getState(env, KEY);

  if (
    !force &&
    !isDue(state, TTL_MS)
  ) {
    return {
      refreshed: false,
      reason: "fresh"
    };
  }

  if (
    !await acquireLease(
      env,
      KEY,
      120
    )
  ) {
    return {
      refreshed: false,
      reason: "already-refreshing"
    };
  }

  try {
    let { url } =
      await getTjkProgramUrl(env);

    let program: TjkProgramInput;

    try {
      program = await extractProgram(
        env,
        url
      );
    } catch {
      // URL changed => registry rediscovery.
      url =
        await rediscoverTjkProgramUrl(env);

      program = await extractProgram(
        env,
        url
      );
    }

    assertCompleteProgram(program);

    const hash = await sha256(
      JSON.stringify(program)
    );

    const old = await env.DB
      .prepare(`
        SELECT source_hash
        FROM meetings
        WHERE race_date =
          date('now', '+3 hours')
        LIMIT 1
      `)
      .first<any>();

    if (
      old?.source_hash !== hash
    ) {
      await upsertProgram(
        env,
        program,
        hash
      );
    }

    await markSuccess(
      env,
      KEY
    );

    return {
      refreshed: true,
      reason:
        old?.source_hash === hash
          ? "unchanged"
          : "updated"
    };
  } catch (error) {
    await markFailure(
      env,
      KEY,
      errorMessage(error)
    );

    throw error;
  }
}
