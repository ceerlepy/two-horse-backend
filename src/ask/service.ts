import type {
  Env
} from "../env";

import {
  errorMessage,
  sha256,
  turkeyDate
} from "../shared";

import {
  logger
} from "../observability/logger";

import {
  getToday
} from "../storage/program-repository";

import {
  attachValues,
  loadTodayValues
} from "../value-model/service";

import {
  cachedAiRun
} from "../experts/ai-response-cache";

import {
  getForeignMeeting,
  getForeignRace
} from "../foreign/service";

import {
  TIER_LIMITS,
  type MembershipTier
} from "../membership/tier";

/*
 * "AI'ya sor": a Premium member asks a free-text question about one
 * of today's races and gets a short answer written only from our own
 * data for that race (score, AGF and its movement, expert consensus
 * counts, recent form, value model). No web search, no source names,
 * no third-party text goes into the prompt.
 *
 * Cost control, since every uncached answer is a billed Workers AI
 * call:
 * - model: Gemma 4 26B ($0.10 / $0.30 per M input / output tokens),
 *   about 5x cheaper per answer than Llama 3.3 70B, which is only the
 *   fallback when Gemma fails or returns nothing;
 * - per user: TIER_LIMITS.askAiPerDay distinct questions a Turkey day
 *   (asking the same question about the same race again is free), so
 *   cost grows only with paying members;
 * - per answer: the prompt is one compact race table and the answer
 *   is capped at maxAnswerTokens;
 * - cache: identical (race data, question) pairs reuse the stored
 *   answer, so many members asking the same thing pay once;
 * - global: a safety net of globalDailyAiCalls billed calls a day
 *   against bugs or mass fake accounts. Each member's own allowance is
 *   separate, so no single member can use it up; normal use never
 *   reaches it.
 */
export const ASK_AI_CONFIG = {
  model: "@cf/google/gemma-4-26b-a4b-it",
  fallbackModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  maxQuestionChars: 300,
  maxAnswerTokens: 350,
  globalDailyAiCalls: 5000
} as const;

export type AskLanguage = "tr" | "en";

export interface AskRequest {
  city: string;
  raceNumber: number;
  question: string;
  language: AskLanguage;
  /* A TJK foreign ("YD") card; see foreignRaceContext below. */
  foreign?: boolean;
  /*
   * The card's own date for a foreign meeting: an American card runs
   * past midnight Turkey time but keeps its date. Today or yesterday.
   */
  raceDate?: string;
}

/*
 * raceNumber 0 on a foreign card asks about the whole meeting (the
 * screen's bottom-right button); a race card's own button sends its
 * race number.
 */
export const WHOLE_MEETING = 0;

export type AskResult =
  | {
    ok: true;
    answer: string;
    cached: boolean;
    used: number;
    limit: number;
  }
  | {
    ok: false;
    error:
      | "TIER_UPGRADE_REQUIRED"
      | "INVALID_QUESTION"
      | "RACE_NOT_FOUND"
      | "DAILY_LIMIT_REACHED"
      | "ASK_BUSY"
      | "ASK_FAILED";
    used?: number;
    limit?: number;
  };

export function normalizeQuestion(
  value: string
): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function fixed(
  value: unknown,
  digits = 1
): string {
  const number = Number(value);
  return value != null && Number.isFinite(number)
    ? number.toFixed(digits)
    : "-";
}

function percent(
  value: unknown
): string {
  const number = Number(value);
  return value != null && Number.isFinite(number)
    ? `${Math.round(number * 100)}%`
    : "-";
}

/*
 * One line per runner, ranked by our score. Only derived numbers and
 * counts: expert sources appear as counts per category, never by name
 * or text.
 */
export function raceContext(
  race: any
): string {
  const runners =
    [...(race.runners ?? [])]
      .filter((runner: any) => runner?.horse_number != null)
      .sort(
        (a: any, b: any) =>
          Number(b?.modelScore?.score ?? -1) -
          Number(a?.modelScore?.score ?? -1)
      );

  const lines =
    runners.map((runner: any, index: number) => {
      const consensus = runner.expertConsensus ?? {};
      const market = runner.marketMovement ?? {};
      const value = runner.valueModel ?? {};

      const experts =
        consensus.sourceCount
          ? `experts ${consensus.sourceCount} (banko ${consensus.bankoCount ?? 0}, fav ${consensus.favoriteCount ?? 0}, strong ${consensus.strongCount ?? 0}, star ${consensus.starCount ?? 0}, surprise ${consensus.surpriseCount ?? 0}, avoid ${consensus.avoidCount ?? 0})`
          : "experts 0";

      return [
        `${index + 1}. #${runner.horse_number} ${runner.horse_name ?? ""}`.trim(),
        `jockey ${runner.jockey || "-"}`,
        `score ${fixed(runner?.modelScore?.score)}`,
        `AGF ${fixed(runner.agf_percent)}%`,
        market.direction && market.direction !== "unknown"
          ? `AGF ${market.direction} ${fixed(market.firstAgf)}→${fixed(market.latestAgf)}`
          : null,
        `HP ${runner.hp ?? "-"}`,
        `kg ${runner.weight ?? "-"}`,
        `form ${runner.recent_form_raw || "debut"}`,
        experts,
        value.probability != null
          ? `value ${percent(value.probability)}${value.label ? ` ${value.label}` : ""}`
          : null
      ]
        .filter(Boolean)
        .join(" | ");
    });

  return [
    "Columns: our rank. #number name | jockey | our score 0-100 | AGF share | AGF move first→latest | handicap points | weight | recent finishes (newest last) | expert pick counts | value model win chance and whether AGF under/overrates it",
    `Race: ${race.city} race ${race.race_number}, ${race.distance_meters ?? "?"}m ${race.track ?? ""}, starts ${race.start_time ?? race.starts_at ?? "?"}`,
    race.uncertainty?.level ? `Race uncertainty: ${race.uncertainty.level}` : null,
    ...lines
  ]
    .filter(Boolean)
    .join("\n");
}

/*
 * The same table for a foreign card, with the columns a foreign
 * meeting actually has. TJK publishes no handicap points there, we
 * keep no AGF history for those races and no expert covers them, so
 * the model is told plainly which columns do not exist rather than
 * being left to guess from blanks.
 */
export function foreignRaceContext(
  meeting: { city: string; country: string | null },
  race: any
): string {
  const runners =
    [...(race.runners ?? [])]
      .filter((runner: any) => runner?.number != null)
      .sort(
        (a: any, b: any) =>
          Number(b?.winProb ?? -1) - Number(a?.winProb ?? -1)
      );

  const lines =
    runners.map((runner: any, index: number) =>
      [
        `${index + 1}. #${runner.number} ${runner.name ?? ""}`.trim(),
        `jockey ${runner.jockey || "-"}`,
        runner.winProb != null
          ? `our win chance ${percent(runner.winProb)}`
          : "our win chance - (TJK published no AGF for this horse)",
        `AGF ${fixed(runner.agfPercent)}%`,
        `kg ${runner.weight ?? "-"}`,
        `form ${runner.recentForm || "debut"}`
      ]
        .filter(Boolean)
        .join(" | ")
    );

  return [
    "Columns: our rank. #number name | jockey | our corrected win chance | AGF share | weight | recent finishes (newest last)",
    "This is a foreign card: there are no expert picks, no handicap points and no AGF movement for it. Our win chance is AGF corrected for the country and the field size.",
    `Race: ${meeting.city}${meeting.country ? ` (${meeting.country})` : ""} race ${race.raceNumber}, ${race.distanceMeters ?? "?"}m ${race.track ?? ""}, starts ${race.time ?? "?"}`,
    ...lines
  ]
    .filter(Boolean)
    .join("\n");
}

/* Every race of a foreign meeting, top runners only, for meeting-wide questions. */
export function foreignMeetingContext(
  meeting: { city: string; country: string | null; races: any[] }
): string {
  const races =
    [...(meeting.races ?? [])]
      .sort((a: any, b: any) => Number(a.raceNumber) - Number(b.raceNumber))
      .map((race: any) => {
        const runners =
          [...(race.runners ?? [])]
            .filter((runner: any) => runner?.number != null)
            .sort(
              (a: any, b: any) =>
                Number(b?.winProb ?? -1) - Number(a?.winProb ?? -1)
            )
            .slice(0, 5)
            .map((runner: any) =>
              `#${runner.number} ${runner.name ?? ""} ${
                runner.winProb != null ? percent(runner.winProb) : "-"
              } (AGF ${fixed(runner.agfPercent)}%, form ${runner.recentForm || "debut"})`
            );

        const result =
          (race.result ?? []).length
            ? ` | official result: ${(race.result as any[])
              .map(item => `${item.position}. #${item.number} ${item.name}`)
              .join(", ")}`
            : "";

        return `Race ${race.raceNumber} (${race.time ?? "?"}, ${race.distanceMeters ?? "?"}m ${race.track ?? ""}, ${(race.runners ?? []).length} runners): ${runners.join("; ")}${result}`;
      });

  return [
    `Meeting: ${meeting.city}${meeting.country ? ` (${meeting.country})` : ""}, the whole card. Each race lists our top five by corrected win chance.`,
    "This is a foreign card: there are no expert picks, no handicap points and no AGF movement for it. Our win chance is AGF corrected for the country and the field size.",
    ...races
  ].join("\n");
}

export function askMessages(
  context: string,
  question: string,
  language: AskLanguage
): Array<{ role: string; content: string }> {
  const answerLanguage =
    language === "en" ? "English" : "Turkish";

  return [
    {
      role: "system",
      content: [
        "You are Two Horse's horse racing analyst for Turkish (TJK) races.",
        "Answer ONLY from the race data provided. If the data does not answer the question, say so briefly.",
        "Do not invent horses, odds, results or statistics. Do not mention websites or tipsters.",
        "Explain your reasoning with the numbers given (our score, AGF and its movement, expert counts, form, value model).",
        "Never promise a win or a profit; racing is uncertain. Keep it under 100 words.",
        "If the question is not about this race or horse racing, politely decline.",
        `Answer in ${answerLanguage}. Keep horse and jockey names exactly as written.`
      ].join(" ")
    },
    {
      role: "user",
      content: `${context}\n\nQuestion: ${question}`
    }
  ];
}

/*
 * Gemma 4 answers in the OpenAI chat format, the Llama fallback in
 * Workers AI's { response } format.
 */
export function answerText(
  raw: any
): string {
  const content =
    raw?.choices?.[0]?.message?.content ?? raw?.response;

  return typeof content === "string" ? content.trim() : "";
}

function modelInput(
  model: string,
  messages: Array<{ role: string; content: string }>
): Record<string, unknown> {
  return model === ASK_AI_CONFIG.model
    ? {
      messages,
      max_completion_tokens: ASK_AI_CONFIG.maxAnswerTokens,
      temperature: 0,
      // A short factual answer: no hidden reasoning tokens to pay for.
      chat_template_kwargs: { enable_thinking: false }
    }
    : {
      messages,
      max_tokens: ASK_AI_CONFIG.maxAnswerTokens,
      temperature: 0
    };
}

function findRace(
  meetings: any[],
  city: string,
  raceNumber: number
): any | null {
  const wanted = city.trim().toLocaleLowerCase("tr-TR");

  for (const meeting of meetings) {
    if (String(meeting.city ?? "").toLocaleLowerCase("tr-TR") !== wanted) {
      continue;
    }

    for (const race of meeting.races ?? []) {
      if (Number(race.race_number) === raceNumber) {
        return { ...race, city: race.city ?? meeting.city };
      }
    }
  }

  return null;
}

async function questionKey(
  request: AskRequest
): Promise<string> {
  return sha256(
    [
      request.city.trim().toLocaleLowerCase("tr-TR"),
      request.raceNumber,
      request.foreign ? `yd:${request.raceDate ?? ""}` : "tr",
      request.language,
      normalizeQuestion(request.question)
    ].join("|")
  );
}

async function usage(
  env: Env,
  userId: string,
  date: string,
  key: string
): Promise<{ used: number; repeated: boolean; billedToday: number }> {
  const row =
    await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS used,
        SUM(CASE WHEN user_id = ? AND question_key = ? THEN 1 ELSE 0 END) AS repeated,
        SUM(billed) AS billed
      FROM ask_ai_log
      WHERE usage_date = ?
    `)
      .bind(userId, userId, key, date)
      .first<any>();

  return {
    used: Number(row?.used ?? 0),
    repeated: Number(row?.repeated ?? 0) > 0,
    billedToday: Number(row?.billed ?? 0)
  };
}

/* Pseudo user id that carries billed calls of failed answers. */
const FAILED_ANSWER_USER = "_failed";

async function logAsk(
  env: Env,
  userId: string,
  date: string,
  key: string,
  billed: number,
  now: Date
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO ask_ai_log (user_id, usage_date, question_key, billed, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, usage_date, question_key) DO UPDATE SET
      billed = ask_ai_log.billed + excluded.billed
  `)
    .bind(userId, date, key, billed, now.toISOString())
    .run();
}

export async function askAi(
  env: Env,
  userId: string,
  tier: MembershipTier,
  request: AskRequest,
  now: Date = new Date()
): Promise<AskResult> {
  const limit = TIER_LIMITS[tier].askAiPerDay;

  if (limit <= 0) {
    return { ok: false, error: "TIER_UPGRADE_REQUIRED" };
  }

  const question = request.question.replace(/\s+/g, " ").trim();

  if (
    question.length < 3 ||
    question.length > ASK_AI_CONFIG.maxQuestionChars ||
    !request.city ||
    !Number.isInteger(request.raceNumber) ||
    request.raceNumber < 0 ||
    (request.raceNumber === WHOLE_MEETING && !request.foreign)
  ) {
    return { ok: false, error: "INVALID_QUESTION" };
  }

  const date = turkeyDate(now);
  const key = await questionKey({ ...request, question });
  const before = await usage(env, userId, date, key);

  if (!before.repeated && before.used >= limit) {
    return { ok: false, error: "DAILY_LIMIT_REACHED", used: before.used, limit };
  }

  let context: string;

  if (request.foreign) {
    const yesterday =
      new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000)
        .toISOString()
        .slice(0, 10);

    const cardDate =
      request.raceDate === yesterday ? yesterday : date;

    if (request.raceNumber === WHOLE_MEETING) {
      const meeting = await getForeignMeeting(env, cardDate, request.city);

      if (!meeting) {
        return { ok: false, error: "RACE_NOT_FOUND" };
      }

      context = foreignMeetingContext(meeting);
    } else {
      const found =
        await getForeignRace(env, cardDate, request.city, request.raceNumber);

      if (!found) {
        return { ok: false, error: "RACE_NOT_FOUND" };
      }

      context = foreignRaceContext(found, found.race);
    }
  } else {
    const meetings =
      attachValues(
        await getToday(env),
        await loadTodayValues(env, date)
          .catch(() => ({ status: "unavailable", byRunner: new Map() }))
      );

    const race = findRace(meetings, request.city, request.raceNumber);

    if (!race) {
      return { ok: false, error: "RACE_NOT_FOUND" };
    }

    context = raceContext(race);
  }

  /*
   * The prompt carries the normalized question, so "Kim kazanır?" and
   * "kim  KAZANIR?" share one cached answer across all members.
   */
  const messages =
    askMessages(context, normalizeQuestion(question), request.language);

  /*
   * The global cap only blocks billed calls: a cached answer is still
   * served when the cap is reached (cacheOnly never calls the model).
   */
  const capped = before.billedToday >= ASK_AI_CONFIG.globalDailyAiCalls;

  let answer = "";
  let cached = false;
  let billed = 0;

  for (const model of [ASK_AI_CONFIG.model, ASK_AI_CONFIG.fallbackModel]) {
    try {
      const result = await cachedAiRun(
        env,
        model,
        modelInput(model, messages),
        (raw: unknown) => answerText(raw).length > 0,
        { cacheOnly: capped }
      );

      if (!capped && !result.cacheHit) {
        billed += 1;
      }

      answer = answerText(result.raw);
      cached = result.cacheHit;
    } catch (error) {
      logger.warn(env, "ask-ai.model-failed", { model, error: errorMessage(error) });
      answer = "";
    }

    if (answer) {
      break;
    }

    if (!capped && model === ASK_AI_CONFIG.model) {
      logger.warn(env, "ask-ai.fallback", { model });
    }
  }

  if (!answer) {
    /*
     * A failed answer does not use the member's allowance, but the
     * calls it billed still count toward the global safety net.
     */
    if (billed > 0) {
      await logAsk(env, FAILED_ANSWER_USER, date, key, billed, now);
    }

    return {
      ok: false,
      error: capped ? "ASK_BUSY" : "ASK_FAILED",
      used: before.used,
      limit
    };
  }

  await logAsk(env, userId, date, key, billed, now);

  return {
    ok: true,
    answer,
    cached,
    used: before.repeated ? before.used : before.used + 1,
    limit
  };
}

export async function cleanupAskAiLog(
  env: Env
): Promise<void> {
  await env.DB.prepare(`
    DELETE FROM ask_ai_log
    WHERE usage_date < date('now', '-30 days')
  `).run();
}
