import type { Env } from "../env";
import { acquireHttpHtml } from "../acquisition/http";
import { turkeyDate } from "../shared";
import { decodeEntities } from "./archive-parser";
import { tjkNumericId } from "./cities";
import type { Gallop } from "./features";

/*
 * A horse's latest training gallops (TJK keeps the newest 50 on
 * İdman İstatistikleri). The value model only looks back 30 days, so one
 * fetch per horse per race day is enough.
 */
export const GALLOP_CONFIG = {
  horsesPerTick: 30,
  concurrency: 5,
  refetchAfterHours: 12,
  fetchTimeoutMs: 15_000,
  retentionDays: 120
} as const;

export function gallopUrl(horseId: number): string {
  return `https://www.tjk.org/TR/YarisSever/Query/Data/IdmanIstatistikleri?QueryParameter_AtId=${horseId}`;
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/* "0.43.40" -> 43.4 seconds */
function splitSeconds(value: string): number | null {
  const m = /^(\d)\.(\d{2})\.(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100 : null;
}

export function parseGallops(html: string): Gallop[] {
  const table = /<table[\s\S]*?<\/table>/.exec(html);
  if (!table) return [];
  const rows = [...table[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map(m => m[0]);
  if (!rows.length) return [];
  const headers = [...rows[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => cellText(m[1]));
  const col = (name: string) => headers.indexOf(name);
  const iDate = col("İ. Tarihi"), iEffort = col("Durum"), iHip = col("İ. Hip."), iSurface = col("Pist");
  const iKind = col("İ. Türü");
  if (iDate < 0) return [];

  const out: Gallop[] = [];
  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]));
    if (cells.length !== headers.length) continue;
    const date = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cells[iDate]);
    if (!date) continue;
    const splits: Record<string, number> = {};
    headers.forEach((h, i) => {
      const metres = /^(\d{3,4})m$/.exec(h);
      const seconds = metres ? splitSeconds(cells[i]) : null;
      if (metres && seconds != null) splits[metres[1]] = seconds;
    });
    out.push({
      date: `${date[3]}-${date[2]}-${date[1]}`,
      hippodrome: iHip >= 0 ? cells[iHip] : "",
      surface: iSurface >= 0 ? cells[iSurface] : "",
      effort: iEffort >= 0 ? cells[iEffort] : "",
      kind: iKind >= 0 ? cells[iKind] : "",
      splits
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function storeGallops(env: Env, horseId: number, gallops: Gallop[]): Promise<void> {
  const now = new Date().toISOString();
  const statements = gallops.map(g => env.DB.prepare(`
    INSERT OR REPLACE INTO horse_gallops(horse_id, gallop_date, hippodrome, surface, kind, effort, splits_json)
    VALUES(?,?,?,?,?,?,?)
  `).bind(horseId, g.date, g.hippodrome, g.surface, g.kind ?? "", g.effort, JSON.stringify(g.splits)));
  statements.push(env.DB.prepare(`
    INSERT INTO horse_gallop_state(horse_id, fetched_at, row_count) VALUES(?,?,?)
    ON CONFLICT(horse_id) DO UPDATE SET fetched_at=excluded.fetched_at, row_count=excluded.row_count
  `).bind(horseId, now, gallops.length));
  for (let i = 0; i < statements.length; i += 60) await env.DB.batch(statements.slice(i, i + 60));
}

/* Today's runners whose gallops are missing or older than refetchAfterHours. */
export async function refreshGallops(env: Env, today = turkeyDate()): Promise<{ fetched: number; failed: number }> {
  const cutoff = new Date(Date.now() - GALLOP_CONFIG.refetchAfterHours * 3_600_000).toISOString();
  const rows = await env.DB.prepare(`
    SELECT DISTINCT u.horse_id AS identity
    FROM runners u
    JOIN races r USING (race_date, city, race_number)
    LEFT JOIN horse_gallop_state s
      ON s.horse_id = CAST(substr(u.horse_id, 11) AS INTEGER)
    WHERE u.race_date = ? AND u.horse_id LIKE 'tjk-horse:%'
      AND (r.starts_at IS NULL OR r.starts_at > ?)
      AND (s.fetched_at IS NULL OR s.fetched_at < ?)
    ORDER BY r.starts_at
    LIMIT ?
  `).bind(today, new Date().toISOString(), cutoff, GALLOP_CONFIG.horsesPerTick).all<any>();
  const ids = (rows.results ?? []).map((r: any) => tjkNumericId(r.identity)).filter((x): x is number => x != null);

  let fetched = 0, failed = 0;
  for (let i = 0; i < ids.length; i += GALLOP_CONFIG.concurrency) {
    await Promise.all(ids.slice(i, i + GALLOP_CONFIG.concurrency).map(async id => {
      try {
        const page = await acquireHttpHtml(gallopUrl(id), { timeoutMs: GALLOP_CONFIG.fetchTimeoutMs, minimumBytes: 50 });
        await storeGallops(env, id, parseGallops(page.html));
        fetched++;
      } catch {
        failed++;
      }
    }));
  }
  return { fetched, failed };
}

export async function loadGallops(env: Env, horseIds: number[]): Promise<Map<number, Gallop[]>> {
  const out = new Map<number, Gallop[]>();
  if (!horseIds.length) return out;
  const marks = horseIds.map(() => "?").join(",");
  const fetched = await env.DB.prepare(`SELECT horse_id FROM horse_gallop_state WHERE horse_id IN (${marks})`)
    .bind(...horseIds).all<any>();
  for (const r of fetched.results ?? []) out.set(Number(r.horse_id), []);
  const rows = await env.DB.prepare(`
    SELECT horse_id, gallop_date, hippodrome, surface, effort, splits_json
    FROM horse_gallops WHERE horse_id IN (${marks}) ORDER BY gallop_date
  `).bind(...horseIds).all<any>();
  for (const r of rows.results ?? []) {
    const list = out.get(Number(r.horse_id)) ?? [];
    list.push({
      date: r.gallop_date, hippodrome: r.hippodrome, surface: r.surface, effort: r.effort,
      splits: JSON.parse(r.splits_json || "{}")
    });
    out.set(Number(r.horse_id), list);
  }
  return out;
}
