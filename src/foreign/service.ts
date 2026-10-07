import type {
  Env
} from "../env";

import {
  turkeyDate
} from "../shared";

import {
  acquireHttpHtml
} from "../acquisition/http";

import {
  parseTjkMeetingPage
} from "../tjk/html-parser";

import {
  acquireLease,
  getState,
  isDue,
  markFailure,
  markSuccess
} from "../storage/state";

import {
  getBankoForeignPicks
} from "./banko";

import type {
  BankoPicks
} from "./banko-picks";

import {
  foreignCountryGroup,
  withForeignWinProbs
} from "./calibration";

import {
  buildForeignModelCoupons,
  type ForeignModelCoupon
} from "./model-coupon";

import {
  discoverForeignMeetingLinks,
  raceDateOfForeignLink,
  type ForeignMeetingLink
} from "./discovery";


const KEY = "foreign.program";

const TJK_PROGRAM_URL =
  "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";

export const FOREIGN_CONFIG = {
  /* AGF on foreign cards moves too; keep it reasonably fresh. */
  ttlMs: 20 * 60_000,
  fetchTimeoutMs: 20_000,
  concurrency: 3
} as const;


export interface ForeignRunner {
  number: number;
  name: string;
  jockey: string | null;
  weight: number | null;
  agfPercent: number | null;
  recentForm: string | null;
  /* Calibrated AGF win probability (0..1); Gold+ only, see ./calibration.ts. */
  winProb?: number | null;
}

export interface ForeignAiPick {
  /* Site's ranking for the race, top pick first. */
  ranked: Array<{ number: number; name: string }>;
  /* Horses on the site's altılı coupon for this race. */
  selection: number[];
}

export interface ForeignRace {
  raceNumber: number;
  time: string | null;
  distanceMeters: number | null;
  track: string | null;
  runners: ForeignRunner[];
  /*
   * Which altılı windows start at this race, as TJK marks them on the
   * meeting page (1 and/or 2). Kept so we can build our own coupon for
   * the card -- see ./model-coupon.ts.
   */
  sixfoldStartNumbers?: number[];
  aiPick?: ForeignAiPick | null;
}

export interface ForeignAiCoupon {
  altili: number;
  startTime: string | null;
  legs: Array<{ raceNumber: number; selection: number[] }>;
  combinations: number | null;
  amountTl: number | null;
}

export interface ForeignMeeting {
  city: string;
  country: string | null;
  ydOrder: number | null;
  races: ForeignRace[];
  fetchedAt: string;
  /* Scraped from an outside tipster site; see ./banko.ts. */
  aiCoupons?: ForeignAiCoupon[];
  /* Ours, from the calibrated win probabilities. */
  modelCoupons?: ForeignModelCoupon[];
}


async function fetchMeeting(
  link: ForeignMeetingLink
): Promise<ForeignRace[]> {
  const acquired = await acquireHttpHtml(link.url, {
    timeoutMs: FOREIGN_CONFIG.fetchTimeoutMs
  });

  const parsed = parseTjkMeetingPage(acquired.html, link.city, link.url);

  return parsed.races
    .filter(race => race.runners.length > 0)
    .map(race => ({
      raceNumber: race.raceNumber,
      time: race.time ?? null,
      distanceMeters: race.distanceMeters ?? null,
      track: race.track ?? null,
      sixfoldStartNumbers: race.sixfoldStartNumbers ?? [],
      runners: race.runners.map(runner => ({
        number: runner.number,
        name: runner.name,
        jockey: runner.jockey ?? null,
        weight: runner.weight ?? null,
        agfPercent: runner.agfPercent ?? null,
        recentForm: runner.recentFormRaw ?? null
      }))
    }));
}


export async function refreshForeignMeetingsIfDue(
  env: Env,
  force = false
): Promise<{ refreshed: boolean; meetings: number; failed: string[] }> {
  const state = await getState(env, KEY);

  if (!force && !isDue(state, FOREIGN_CONFIG.ttlMs)) {
    return { refreshed: false, meetings: 0, failed: [] };
  }

  if (!await acquireLease(env, KEY, 180)) {
    return { refreshed: false, meetings: 0, failed: [] };
  }

  try {
    const master = await acquireHttpHtml(TJK_PROGRAM_URL, { timeoutMs: 15_000 });
    const links = discoverForeignMeetingLinks(master.html, TJK_PROGRAM_URL);
    const raceDate = turkeyDate();
    const fetchedAt = new Date().toISOString();
    const failed: string[] = [];
    let stored = 0;
    let cursor = 0;

    async function worker(): Promise<void> {
      while (cursor < links.length) {
        const link = links[cursor++];
        try {
          const races = await fetchMeeting(link);
          if (!races.length) {
            failed.push(link.city);
            continue;
          }
          await env.DB.prepare(`
            INSERT INTO foreign_meetings(
              race_date, city, country, yd_order, program_json, source_url, fetched_at
            )
            VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(race_date, city) DO UPDATE SET
              country = excluded.country,
              yd_order = excluded.yd_order,
              program_json = excluded.program_json,
              source_url = excluded.source_url,
              fetched_at = excluded.fetched_at
          `)
            .bind(
              raceDateOfForeignLink(link.url) ?? raceDate, link.city, link.country, link.ydOrder,
              JSON.stringify(races), link.url, fetchedAt
            )
            .run();
          stored++;
        } catch {
          failed.push(link.city);
        }
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(FOREIGN_CONFIG.concurrency, links.length) },
        () => worker()
      )
    );

    /* Keep yesterday for late viewers; drop anything older. */
    await env.DB.prepare(`
      DELETE FROM foreign_meetings
      WHERE race_date < date(?, '-1 day')
    `)
      .bind(raceDate)
      .run();

    await markSuccess(env, KEY);
    return { refreshed: true, meetings: stored, failed };
  } catch (error) {
    await markFailure(env, KEY, error instanceof Error ? error.message : String(error));
    throw error;
  }
}


export async function getForeignMeetings(
  env: Env,
  raceDate: string = turkeyDate(),
  /* Gold+ model signals: AI picks/coupons and calibrated winProb. */
  includeModelSignals = false
): Promise<ForeignMeeting[]> {
  const picksByCity =
    includeModelSignals
      ? await getBankoForeignPicks(env, raceDate)
      : new Map<string, BankoPicks>();

  const rows = await env.DB.prepare(`
    SELECT city, country, yd_order, program_json, fetched_at
    FROM foreign_meetings
    WHERE race_date = ?
    ORDER BY COALESCE(yd_order, 99), city
  `)
    .bind(raceDate)
    .all<any>();

  return (rows.results ?? []).map(row => {
    let races: ForeignRace[] = [];
    try {
      races = JSON.parse(row.program_json);
    } catch {
      races = [];
    }
    const picks = picksByCity.get(row.city);

    if (picks) {
      races = races.map(race => {
        const pick = picks.races.find(item => item.raceNumber === race.raceNumber);
        return {
          ...race,
          aiPick: pick
            /*
             * The site's prose comment is never sent: like domestic
             * expert picks, only the derived ranking and selection
             * reach the app, not a third party's text.
             */
            ? { ranked: pick.ranked, selection: pick.selection }
            : null
        };
      });
    }

    let modelCoupons: ForeignModelCoupon[] = [];

    if (includeModelSignals) {
      const group = foreignCountryGroup(row.city, row.country);
      races = races.map(race => withForeignWinProbs(race, group));
      modelCoupons = buildForeignModelCoupons(races);
    }

    return {
      city: row.city,
      country: row.country ?? null,
      ydOrder: row.yd_order ?? null,
      races,
      fetchedAt: row.fetched_at,
      ...(includeModelSignals
        ? { aiCoupons: picks?.coupons ?? [], modelCoupons }
        : {})
    };
  });
}
