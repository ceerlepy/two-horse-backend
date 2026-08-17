import type { Env } from "../env";
import { isoNow } from "../shared";

export interface RefreshState {
  pipeline_key: string;
  last_success_at: string | null;
  last_attempt_at: string | null;
  next_allowed_at: string | null;
  failure_count: number;
  lease_until: string | null;
  last_error: string | null;
}

export async function getState(env: Env, key: string): Promise<RefreshState | null> {
  return env.DB.prepare("SELECT * FROM refresh_state WHERE pipeline_key=?").bind(key).first<RefreshState>();
}

export async function ensureState(env: Env, key: string): Promise<void> {
  await env.DB.prepare("INSERT OR IGNORE INTO refresh_state(pipeline_key) VALUES (?)").bind(key).run();
}

export async function acquireLease(env: Env, key: string, seconds = 90): Promise<boolean> {
  await ensureState(env, key);
  const now = isoNow();
  const until = new Date(Date.now() + seconds * 1000).toISOString();
  const result = await env.DB.prepare(`
    UPDATE refresh_state SET lease_until=?, last_attempt_at=?, updated_at=CURRENT_TIMESTAMP
    WHERE pipeline_key=? AND (lease_until IS NULL OR lease_until < ?)
  `).bind(until, now, key, now).run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function markSuccess(env: Env, key: string): Promise<void> {
  const now = isoNow();
  await env.DB.prepare(`UPDATE refresh_state SET last_success_at=?, next_allowed_at=NULL,
    failure_count=0, lease_until=NULL, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE pipeline_key=?`)
    .bind(now, key).run();
}

export async function markFailure(env: Env, key: string, message: string): Promise<void> {
  const state = await getState(env, key);
  const failures = (state?.failure_count ?? 0) + 1;
  const backoffMinutes = failures === 1 ? 15 : failures === 2 ? 30 : 60;
  const next = new Date(Date.now() + backoffMinutes * 60_000).toISOString();
  await env.DB.prepare(`UPDATE refresh_state SET failure_count=?, next_allowed_at=?, lease_until=NULL,
    last_error=?, updated_at=CURRENT_TIMESTAMP WHERE pipeline_key=?`)
    .bind(failures, next, message.slice(0, 1500), key).run();
}

export function isDue(state: RefreshState | null, ttlMs: number): boolean {
  const now = Date.now();
  if (state?.next_allowed_at && Date.parse(state.next_allowed_at) > now) return false;
  if (!state?.last_success_at) return true;
  return now - Date.parse(state.last_success_at) >= ttlMs;
}
