import { load } from "cheerio";

import type { Env } from "../env";
import type { ExpertPickInput } from "../types/models";
import type { MembershipTier } from "../membership/tier";

import { stripPremiumRunnerSignals } from "../membership/tier";
import { errorMessage, sha256, turkeyDate } from "../shared";
import { acquireLease, markFailure, markSuccess } from "../storage/state";
import { addDays, loadNextDayProgram } from "../tjk/next-day-service";
import type { NextDayProgram } from "../tjk/next-day-service";

import { expertAdapterFor } from "./adapters/registry";
import { externalTargetUrl, targetCitiesForUrl } from "./adapters/target-scope";
import type { ExpertTargetResolution } from "./adapters/types";
import { aggregateExpertPredictions } from "./aggregator";
import type { ExpertPredictionRow } from "./aggregation-types";
import { directPageDateEvidence } from "./discovery";
import {
  acquireExpertDocument,
  extractExperts
} from "./extractor";
import type {
  ExpertAcquiredDocument,
  ExpertCanonicalCard,
  ExtractedExperts
} from "./extractor";
import { expertFlag } from "./signal-policy";
import { activeExpertSources } from "./source-repository";
import type { ExpertSource } from "./source-types";
import { normalizeExpertSearchText } from "./text-normalization";
import { planExpertRaceBlocks } from "./validator";
import type { CanonicalExpertRunner } from "./validator";

/*
 * Early expert picks for tomorrow's (D+1) card.
 *
 * From 18:00 Turkey time a few sources already publish tomorrow's
 * picks. This service reads them against the stored next-day card
 * (next_day_programs) and keeps one row per (runner, source) in
 * next_day_expert_picks. The app only ever sees a per-runner count
 * of distinct sources plus our own consensus sentence — never a
 * source name or source text.
 *
 * Invariants:
 * - never writes expert_predictions, source_registry (no markExpert*
 *   calls), refresh traces, learning or coupon tables;
 * - never uses Browser Rendering: every adapter runs against an env
 *   whose BROWSER binding throws, so a browser-only path fails closed;
 * - Workers AI runs only when a source's document bundle for D+1
 *   changed since the last extraction (content hash), at most once
 *   per source per cadence window, only inside the evening window,
 *   and only once tomorrow's card is stored.
 */

const LEASE_KEY = "experts:next-day";

export const NEXT_DAY_EXPERT_CONFIG = {
  /* Turkey-local hours [start, 24) in which D+1 sources are read. */
  windowStartHour: 18,
  /* A source is re-checked at most this often per D+1 date. */
  cadenceMinutes: 60,
  leaseSeconds: 600,
  /*
   * Sources with real D+1 evidence and an HTTP-only path. AFA needs
   * Browser Rendering and is excluded for now.
   */
  sources: [
    "puanli_altili_bulten",
    "horseturk",
    "istinye_ganyan",
    "ganyan_canavari"
  ] as readonly string[],
  /*
   * istinye_ganyan reuses one URL (/ganyan/tahminler/) for whatever
   * day it currently covers, so its content must prove it is about
   * D+1 (and not still about today).
   */
  requireDateEvidence: ["istinye_ganyan"] as readonly string[]
} as const;

export interface NextDayExpertDeps {
  sources?: (env: Env) => Promise<ExpertSource[]>;
  resolve?: (
    env: Env,
    source: ExpertSource,
    raceDate: string,
    cities: string[]
  ) => Promise<ExpertTargetResolution>;
  acquire?: (
    env: Env,
    url: string,
    sourceKey: string,
    cities: string[],
    raceDate: string
  ) => Promise<ExpertAcquiredDocument>;
  extract?: (
    env: Env,
    url: string,
    sourceName: string,
    sourceKey: string,
    raceDate: string,
    canonical: ExpertCanonicalCard
  ) => Promise<ExtractedExperts>;
}

export interface NextDayExpertOptions extends NextDayExpertDeps {
  now?: Date;
}

export interface NextDaySourceResult {
  source: string;
  status:
    | "cadence"
    | "not-published"
    | "unavailable"
    | "no-date-evidence"
    | "unchanged"
    | "stored"
    | "empty"
    | "partial"
    | "failed";
  aiCalls: number;
  picks: number;
  error?: string;
}

function turkeyHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      hourCycle: "h23"
    }).format(now)
  );
}

/* Env copy whose Browser Rendering binding fails every use. */
export function browserlessEnv(env: Env): Env {
  const blocked = new Proxy({}, {
    get() {
      throw new Error("BROWSER_DISABLED_FOR_NEXT_DAY_EXPERTS");
    }
  });
  return { ...(env as any), BROWSER: blocked } as Env;
}

export function canonicalCardFromProgram(
  program: NextDayProgram
): ExpertCanonicalCard {
  const cities: string[] = [];
  const runners: CanonicalExpertRunner[] = [];
  const sixfoldStarts: ExpertCanonicalCard["sixfoldStarts"] = [];

  for (const meeting of program.meetings ?? []) {
    if (!meeting?.city) continue;
    cities.push(meeting.city);

    for (const race of meeting.races ?? []) {
      for (const value of race.sixfold_start_numbers ?? []) {
        if (Number.isInteger(value) && value > 0) {
          sixfoldStarts.push({
            city: meeting.city,
            sixfoldNumber: value,
            raceNumber: race.race_number
          });
        }
      }

      for (const runner of race.runners ?? []) {
        runners.push({
          city: meeting.city,
          raceNumber: race.race_number,
          horseNumber: runner.horse_number,
          horseName: runner.horse_name
        });
      }
    }
  }

  return { cities, sixfoldStarts, runners };
}

function bodyText(html: string): string {
  const $ = load(html);
  $("script,style,noscript,svg,iframe").remove();
  return $("body").text() || $.root().text();
}

/*
 * D+1 date evidence for a reused-URL source: the page must carry a
 * D+1 city/date heading and must NOT still carry today's, otherwise
 * today's picks could be stored as tomorrow's.
 */
export function hasNextDayDateEvidence(
  sourceKey: string,
  html: string,
  nextDate: string,
  nextCities: string[],
  today: string,
  todayCities: string[]
): boolean {
  const text = bodyText(html);
  const cities = [...new Set([...nextCities, ...todayCities])];

  const tomorrow = directPageDateEvidence(sourceKey, text, nextDate, nextCities);
  if (!tomorrow.ok || tomorrow.policy === "none") return false;

  const stillToday = directPageDateEvidence(sourceKey, text, today, cities);
  return !stillToday.ok;
}

/*
 * Accept only picks that resolve to a real D+1 runner, using the
 * same race-block planning as today's validator (pure, no D1).
 */
export function matchNextDayPicks(
  runners: CanonicalExpertRunner[],
  picks: ExpertPickInput[]
): ExpertPickInput[] {
  const merged = new Map<string, ExpertPickInput>();

  for (const decision of planExpertRaceBlocks(runners, picks)) {
    if (decision.kind !== "accepted") continue;

    const pick: ExpertPickInput = {
      ...decision.pick,
      city: decision.runner.city,
      raceNumber: decision.runner.raceNumber,
      horseNumber: decision.runner.horseNumber,
      horseName: decision.runner.horseName
    };
    const key = `${pick.city}|${pick.raceNumber}|${pick.horseNumber}`;
    const old = merged.get(key);

    merged.set(key, old ? {
      ...old,
      isFavorite: old.isFavorite || pick.isFavorite,
      isBanko: old.isBanko || pick.isBanko,
      isStrong: old.isStrong || pick.isStrong,
      isStar: old.isStar || pick.isStar,
      isRival: old.isRival || pick.isRival,
      isSurprise: old.isSurprise || pick.isSurprise,
      isAvoid: old.isAvoid || pick.isAvoid,
      confidence: Math.max(old.confidence, pick.confidence)
    } : pick);
  }

  return [...merged.values()];
}

async function todayCities(env: Env, today: string): Promise<string[]> {
  try {
    const rows = await env.DB.prepare(
      "SELECT city FROM meetings WHERE race_date=?"
    ).bind(today).all<{ city: string }>();
    return (rows.results ?? []).map(row => String(row.city)).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeState(
  env: Env,
  sourceKey: string,
  raceDate: string,
  status: string,
  contentHash: string | null,
  failed: boolean,
  now: Date
): Promise<void> {
  /* A null hash keeps the previous one (nothing new was extracted). */
  await env.DB.prepare(`
    INSERT INTO next_day_expert_state(source_key, race_date, content_hash, status, checked_at, failures)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key, race_date) DO UPDATE SET
      content_hash=COALESCE(excluded.content_hash, next_day_expert_state.content_hash),
      status=excluded.status,
      checked_at=excluded.checked_at,
      failures=CASE WHEN ? THEN next_day_expert_state.failures + 1 ELSE 0 END
  `).bind(
    sourceKey, raceDate, contentHash, status, now.toISOString(), failed ? 1 : 0, failed ? 1 : 0
  ).run();
}

function insertPick(
  env: Env,
  raceDate: string,
  sourceKey: string,
  pick: ExpertPickInput,
  fetchedAt: string
) {
  return env.DB.prepare(`
    INSERT INTO next_day_expert_picks(
      race_date, city, race_number, horse_number, source_key,
      is_favorite, is_banko, is_strong, is_star, is_rival, is_surprise, is_avoid,
      confidence, source_rank, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(race_date, city, race_number, horse_number, source_key) DO UPDATE SET
      is_favorite=excluded.is_favorite, is_banko=excluded.is_banko,
      is_strong=excluded.is_strong, is_star=excluded.is_star,
      is_rival=excluded.is_rival, is_surprise=excluded.is_surprise,
      is_avoid=excluded.is_avoid, confidence=excluded.confidence,
      source_rank=excluded.source_rank, fetched_at=excluded.fetched_at
  `).bind(
    raceDate, pick.city, pick.raceNumber, pick.horseNumber, sourceKey,
    pick.isFavorite ? 1 : 0, pick.isBanko ? 1 : 0, pick.isStrong ? 1 : 0,
    pick.isStar ? 1 : 0, pick.isRival ? 1 : 0, pick.isSurprise ? 1 : 0,
    pick.isAvoid ? 1 : 0, Number.isFinite(pick.confidence) ? pick.confidence : 0.5,
    pick.sourceRank ?? null, fetchedAt
  );
}

async function processSource(
  env: Env,
  source: ExpertSource,
  context: {
    now: Date;
    today: string;
    target: string;
    card: ExpertCanonicalCard;
    todayCities: string[];
    deps: Required<NextDayExpertDeps>;
  }
): Promise<NextDaySourceResult> {
  const { now, today, target, card, deps } = context;
  const key = source.source_key;
  const result = (status: NextDaySourceResult["status"], extra: Partial<NextDaySourceResult> = {}) =>
    ({ source: key, status, aiCalls: 0, picks: 0, ...extra });

  const state = await env.DB.prepare(
    "SELECT content_hash, status, checked_at FROM next_day_expert_state WHERE source_key=? AND race_date=?"
  ).bind(key, target).first<{ content_hash: string | null; status: string; checked_at: string }>();

  const checkedAt = Date.parse(state?.checked_at ?? "");
  if (
    Number.isFinite(checkedAt) &&
    now.getTime() - checkedAt < NEXT_DAY_EXPERT_CONFIG.cadenceMinutes * 60_000
  ) {
    return result("cadence");
  }

  let resolution: ExpertTargetResolution;
  try {
    resolution = await deps.resolve(env, source, target, card.cities);
  } catch (error) {
    await writeState(env, key, target, "unavailable", null, true, now);
    return result("unavailable", { error: errorMessage(error) });
  }

  if (resolution.status !== "ready" || !resolution.targets.length) {
    const status = resolution.status === "unavailable" ? "unavailable" : "not-published";
    await writeState(env, key, target, status, null, status === "unavailable", now);
    return result(status);
  }

  /* Phase A: plain HTTP acquisition only (no AI). */
  const documents: Array<{ url: string; document: ExpertAcquiredDocument }> = [];
  const errors: string[] = [];

  for (const url of resolution.targets) {
    try {
      const cities = targetCitiesForUrl(url, card.cities);
      if (!cities.length) continue;
      const document = await deps.acquire(env, url, key, cities, target);

      if (
        NEXT_DAY_EXPERT_CONFIG.requireDateEvidence.includes(key) &&
        !hasNextDayDateEvidence(key, document.acquired.html, target, cities, today, context.todayCities)
      ) {
        errors.push(`NO_NEXT_DAY_DATE_EVIDENCE:${externalTargetUrl(url)}`);
        continue;
      }

      documents.push({ url, document });
    } catch (error) {
      errors.push(errorMessage(error).slice(0, 300));
    }
  }

  if (!documents.length) {
    const noEvidence = errors.length > 0 && errors.every(e => e.startsWith("NO_NEXT_DAY_DATE_EVIDENCE"));
    const status = noEvidence ? "no-date-evidence" : "failed";
    await writeState(env, key, target, status, null, !noEvidence, now);
    return result(status, { error: errors.join(" | ") || undefined });
  }

  const parts = await Promise.all(
    documents.map(async ({ url, document }) =>
      `${url}=${await sha256(document.normalized.text)}`
    )
  );
  const contentHash = await sha256(parts.sort().join("\n"));

  if (
    !errors.length &&
    state?.content_hash === contentHash &&
    (state.status === "stored" || state.status === "empty" || state.status === "unchanged")
  ) {
    await writeState(env, key, target, "unchanged", contentHash, false, now);
    return result("unchanged");
  }

  /* Phase B: extraction (Workers AI unless the source is deterministic). */
  const picks: ExpertPickInput[] = [];
  let aiCalls = 0;

  for (const { url, document } of documents) {
    try {
      const extracted = await deps.extract(
        env, url, source.source_name, key, target, { ...card, document }
      );
      if (/workers-ai/.test(extracted.method)) aiCalls += 1;
      picks.push(...extracted.extraction.picks);
    } catch (error) {
      errors.push(errorMessage(error).slice(0, 300));
    }
  }

  const matched = matchNextDayPicks(card.runners, picks);
  const fetchedAt = now.toISOString();
  const partial = errors.length > 0;

  if (partial && !matched.length) {
    await writeState(env, key, target, "failed", null, true, now);
    return result("failed", { aiCalls, error: errors.join(" | ") });
  }

  /*
   * A complete pass replaces the source's D+1 rows; a partial pass
   * only adds/updates (a failed city keeps what it had) and leaves
   * the hash unset so the next cadence retries.
   */
  const statements = [
    ...(partial
      ? []
      : [env.DB.prepare(
          "DELETE FROM next_day_expert_picks WHERE race_date=? AND source_key=?"
        ).bind(target, key)]),
    ...matched.map(pick => insertPick(env, target, key, pick, fetchedAt))
  ];
  if (statements.length) await env.DB.batch(statements);

  const status = partial ? "partial" : matched.length ? "stored" : "empty";
  await writeState(env, key, target, status, partial ? null : contentHash, partial, now);
  return result(status, { aiCalls, picks: matched.length, error: partial ? errors.join(" | ") : undefined });
}

export async function refreshNextDayExpertsIfDue(
  env: Env,
  options: NextDayExpertOptions = {}
): Promise<{ refreshed: boolean; reason: string; date?: string; results?: NextDaySourceResult[] }> {
  const now = options.now ?? new Date();
  const today = turkeyDate(now);
  const target = addDays(today, 1);

  await env.DB.prepare("DELETE FROM next_day_expert_picks WHERE race_date < ?").bind(today).run();
  await env.DB.prepare("DELETE FROM next_day_expert_state WHERE race_date < ?").bind(today).run();

  if (turkeyHour(now) < NEXT_DAY_EXPERT_CONFIG.windowStartHour) {
    return { refreshed: false, reason: "outside-window", date: target };
  }

  const program = await loadNextDayProgram(env, target);
  if (!program) {
    return { refreshed: false, reason: "no-next-day-program", date: target };
  }

  if (!await acquireLease(env, LEASE_KEY, NEXT_DAY_EXPERT_CONFIG.leaseSeconds)) {
    return { refreshed: false, reason: "already-refreshing", date: target };
  }

  const guarded = browserlessEnv(env);
  const deps: Required<NextDayExpertDeps> = {
    sources: options.sources ?? activeExpertSources,
    resolve: options.resolve ?? ((e, source, raceDate, cities) =>
      expertAdapterFor(source.source_key).resolve({ env: e, source, raceDate, cities })),
    acquire: options.acquire ?? acquireExpertDocument,
    extract: options.extract ?? ((e, url, name, key, raceDate, canonical) =>
      extractExperts(e, url, name, key, raceDate, canonical))
  };

  try {
    const card = canonicalCardFromProgram(program);
    const allowed = new Set(NEXT_DAY_EXPERT_CONFIG.sources);
    const sources = (await deps.sources(env)).filter(s => allowed.has(s.source_key));
    const cities = await todayCities(env, today);
    const results: NextDaySourceResult[] = [];

    for (const source of sources) {
      try {
        results.push(await processSource(guarded, source, {
          now, today, target, card, todayCities: cities, deps
        }));
      } catch (error) {
        results.push({ source: source.source_key, status: "failed", aiCalls: 0, picks: 0, error: errorMessage(error) });
      }
    }

    await markSuccess(env, LEASE_KEY);
    return { refreshed: true, reason: "checked", date: target, results };
  } catch (error) {
    await markFailure(env, LEASE_KEY, errorMessage(error));
    throw error;
  }
}

/* ---------- read side: counts on tomorrow's card ---------- */

function runnerKey(city: string, raceNumber: number, horseNumber: number): string {
  return `${normalizeExpertSearchText(city)}|${raceNumber}|${horseNumber}`;
}

function isPositive(row: ExpertPredictionRow): boolean {
  return [
    row.is_favorite, row.is_banko, row.is_strong,
    row.is_star, row.is_rival, row.is_surprise
  ].some(value => expertFlag(value));
}

/*
 * Adds expertPickCount (distinct sources with a positive pick) and
 * expertSummary (our own counts-only sentence) to nextDay runners.
 * Free tier gets neither, like today's expertConsensus.
 */
export async function attachNextDayExperts(
  env: Env,
  program: NextDayProgram,
  tier: MembershipTier
): Promise<NextDayProgram> {
  if (tier === "free") {
    return stripNextDayExperts(program);
  }

  let rows: Array<ExpertPredictionRow & { city: string; race_number: number; horse_number: number }> = [];
  try {
    const result = await env.DB.prepare(`
      SELECT p.city, p.race_number, p.horse_number, p.source_key,
        s.source_type, s.base_weight, p.confidence, p.source_rank,
        p.is_favorite, p.is_banko, p.is_strong, p.is_star,
        p.is_rival, p.is_surprise, p.is_avoid
      FROM next_day_expert_picks p
      LEFT JOIN source_registry s ON s.source_key = p.source_key
      WHERE p.race_date = ?
    `).bind(program.date).all<any>();
    rows = result.results ?? [];
  } catch {
    return program;
  }

  if (!rows.length) return program;

  const byRunner = new Map<string, ExpertPredictionRow[]>();
  for (const row of rows) {
    const k = runnerKey(row.city, Number(row.race_number), Number(row.horse_number));
    const list = byRunner.get(k) ?? [];
    list.push(row);
    byRunner.set(k, list);
  }

  return {
    ...program,
    meetings: program.meetings.map(meeting => ({
      ...meeting,
      races: meeting.races.map(race => ({
        ...race,
        runners: race.runners.map(runner => {
          const list = byRunner.get(runnerKey(meeting.city, race.race_number, runner.horse_number));
          if (!list?.length) return runner;
          const count = new Set(list.filter(isPositive).map(r => r.source_key)).size;
          if (count <= 0) return runner;
          const summary = aggregateExpertPredictions(list).summary;
          return {
            ...runner,
            expertPickCount: count,
            ...(summary ? { expertSummary: summary } : {})
          };
        })
      }))
    }))
  };
}

export function stripNextDayExperts(program: NextDayProgram): NextDayProgram {
  return {
    ...program,
    meetings: program.meetings.map(meeting => ({
      ...meeting,
      races: meeting.races.map(race => ({
        ...race,
        runners: race.runners.map(runner => stripPremiumRunnerSignals(runner))
      }))
    }))
  };
}
