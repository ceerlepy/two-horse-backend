import type { Env } from "../env";
import { turkeyDate } from "../shared";
import { domesticCity } from "./cities";

/*
 * Pre-race ganyan (win) odds from TJK's public "muhtemeller" feed
 * (vhs.tjk.org/muhtemeller): a per-day checksum.json lists one content
 * hash per race, and <KEY>-<no>-<hash>.json holds the current probable
 * odds of every bet type. Races starting within windowMinutes are polled
 * every tick; a row is written only when a horse's odds changed, so the
 * table keeps the full pre-race path of the win market at low volume.
 */
export const ODDS_CONFIG = {
  windowMinutes: 75,
  fetchTimeoutMs: 10_000,
  retentionDays: 30,
  freshMinutes: 15
} as const;

const MEDIA = "https://vhs-medya.tjk.org/muhtemeller/s";
const CDN = "https://vhs-medya-cdn.tjk.org/muhtemeller/s";

export interface ProbableOdds {
  horseNumber: number;
  odds: number | null;
  scratched: boolean;
}

/* TJK shows 999.99 before any money is in the pool. */
export function parseGanyanProbables(payload: any): ProbableOdds[] | null {
  const bets = payload?.data?.muhtemeller?.bahisler;
  const ganyan = Array.isArray(bets) ? bets.find((b: any) => b?.B === "GANYAN") : null;
  if (!ganyan || !Array.isArray(ganyan.muhtemeller)) return null;
  const out: ProbableOdds[] = [];
  for (const m of ganyan.muhtemeller) {
    const horseNumber = Number(m?.S1);
    if (!Number.isInteger(horseNumber) || horseNumber <= 0) continue;
    const odds = Number(String(m?.G ?? "").replace(",", "."));
    out.push({
      horseNumber,
      odds: Number.isFinite(odds) && odds > 1 && odds < 999 ? odds : null,
      scratched: m?.K === true
    });
  }
  return out;
}

async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ODDS_CONFIG.fetchTimeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cf: { cacheTtl: 0, cacheEverything: false } as any });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshGanyanOdds(env: Env, today = turkeyDate()): Promise<{ races: number; rows: number }> {
  const now = new Date();
  const races = await env.DB.prepare(`
    SELECT city, race_number, starts_at FROM races
    WHERE race_date = ? AND starts_at IS NOT NULL AND starts_at > ? AND starts_at <= ?
    ORDER BY starts_at
  `).bind(today, now.toISOString(), new Date(now.getTime() + ODDS_CONFIG.windowMinutes * 60_000).toISOString()).all<any>();
  const due = (races.results ?? []).filter((r: any) => domesticCity(r.city));
  if (!due.length) return { races: 0, rows: 0 };

  const path = today.replace(/-/g, "/");
  const checksum = await getJson(`${MEDIA}/${path}/checksum.json`);
  const capturedAt = now.toISOString();
  let rows = 0;

  for (const race of due) {
    const key = `${domesticCity(race.city)!.key}-${race.race_number}`;
    const hash = checksum?.runs?.[key]?.[0];
    if (!hash) continue;
    let probables: ProbableOdds[] | null;
    try {
      probables = parseGanyanProbables(await getJson(`${CDN}/${path}/${key}-${hash}.json`));
    } catch {
      continue;
    }
    if (!probables?.length) continue;

    const latest = await env.DB.prepare(`
      SELECT horse_number, odds, scratched FROM ganyan_odds_snapshots s
      WHERE race_date = ? AND city = ? AND race_number = ?
        AND captured_at = (SELECT MAX(captured_at) FROM ganyan_odds_snapshots t
          WHERE t.race_date = s.race_date AND t.city = s.city AND t.race_number = s.race_number
            AND t.horse_number = s.horse_number)
    `).bind(today, race.city, race.race_number).all<any>();
    const previous = new Map((latest.results ?? []).map((r: any) => [Number(r.horse_number), r]));

    const statements = probables
      .filter(p => {
        const prev: any = previous.get(p.horseNumber);
        return !prev || prev.odds !== p.odds || Boolean(prev.scratched) !== p.scratched;
      })
      .map(p => env.DB.prepare(`
        INSERT OR REPLACE INTO ganyan_odds_snapshots(race_date, city, race_number, horse_number, odds, scratched, captured_at)
        VALUES(?,?,?,?,?,?,?)
      `).bind(today, race.city, race.race_number, p.horseNumber, p.odds, p.scratched ? 1 : 0, capturedAt));
    statements.push(env.DB.prepare(`
      INSERT INTO ganyan_odds_polls(race_date, city, race_number, polled_at) VALUES(?,?,?,?)
      ON CONFLICT(race_date, city, race_number) DO UPDATE SET polled_at = excluded.polled_at
    `).bind(today, race.city, race.race_number, capturedAt));
    await env.DB.batch(statements);
    rows += statements.length - 1;
  }
  return { races: due.length, rows };
}

/* Latest odds per horse for one race, if captured within freshMinutes. */
export async function latestOdds(
  env: Env, raceDate: string, city: string, raceNumber: number
): Promise<Map<number, ProbableOdds>> {
  const since = new Date(Date.now() - ODDS_CONFIG.freshMinutes * 60_000).toISOString();
  const rows = await env.DB.prepare(`
    SELECT s.horse_number, s.odds, s.scratched, s.captured_at FROM ganyan_odds_snapshots s
    WHERE s.race_date = ? AND s.city = ? AND s.race_number = ?
      AND s.captured_at = (SELECT MAX(captured_at) FROM ganyan_odds_snapshots t
        WHERE t.race_date = s.race_date AND t.city = s.city AND t.race_number = s.race_number
          AND t.horse_number = s.horse_number)
  `).bind(raceDate, city, raceNumber).all<any>();
  const lastPoll = await env.DB.prepare(`
    SELECT polled_at FROM ganyan_odds_polls WHERE race_date = ? AND city = ? AND race_number = ?
  `).bind(raceDate, city, raceNumber).first<any>();
  const out = new Map<number, ProbableOdds>();
  // Rows are written only on change, so freshness is judged on the race's last poll.
  if (!lastPoll?.polled_at || lastPoll.polled_at < since) return out;
  for (const r of rows.results ?? []) {
    out.set(Number(r.horse_number), { horseNumber: Number(r.horse_number), odds: r.odds == null ? null : Number(r.odds), scratched: Boolean(r.scratched) });
  }
  return out;
}
