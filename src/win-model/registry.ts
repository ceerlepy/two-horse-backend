import type { Env } from "../env";
import { isoNow } from "../shared";
import { LEGACY_WIN_MODEL } from "./legacy";
import type { WinModelId, WinModelStrategy } from "./strategy";
import { UNIFIED_WIN_MODEL } from "./unified";

/*
 * Every model the backend can serve, by id. Which one is live is one row
 * in win_model_state (migration 0055), so switching -- by the weekly check
 * or by hand -- is a data change with no deploy, and the previous id is
 * kept for an instant way back. An unknown or unreadable id serves
 * DEFAULT_WIN_MODEL.
 */
export const WIN_MODELS: Readonly<Record<WinModelId, WinModelStrategy>> = {
  legacy: LEGACY_WIN_MODEL,
  unified: UNIFIED_WIN_MODEL
};

export const DEFAULT_WIN_MODEL: WinModelId = "legacy";

export function isWinModelId(id: unknown): id is WinModelId {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(WIN_MODELS, id);
}

export function resolveWinModel(id: unknown): WinModelStrategy {
  return WIN_MODELS[isWinModelId(id) ? id : DEFAULT_WIN_MODEL];
}

export async function loadActiveWinModel(env: Env): Promise<WinModelStrategy> {
  try {
    const row = await env.DB.prepare(`SELECT active_model FROM win_model_state WHERE id = 1`).first<{ active_model: string }>();
    return resolveWinModel(row?.active_model);
  } catch {
    return resolveWinModel(null);
  }
}

/* The way back: the AGF view of the default model when the active one fails. */
export async function loadValuesWithFallback(
  env: Env,
  strategy: WinModelStrategy,
  raceDate: string,
  meetings: Parameters<WinModelStrategy["loadValues"]>[2]
) {
  try {
    return await strategy.loadValues(env, raceDate, meetings);
  } catch (error) {
    if (strategy.id === DEFAULT_WIN_MODEL) throw error;
    return resolveWinModel(DEFAULT_WIN_MODEL).loadValues(env, raceDate, meetings);
  }
}

export interface WinModelState {
  active: WinModelId;
  previous: WinModelId | null;
  reason: string | null;
  changedAt: string | null;
}

export async function winModelState(env: Env): Promise<WinModelState> {
  const row = await env.DB.prepare(`SELECT * FROM win_model_state WHERE id = 1`).first<any>().catch(() => null);
  return {
    active: resolveWinModel(row?.active_model).id,
    previous: isWinModelId(row?.previous_model) ? row.previous_model : null,
    reason: row?.reason ?? null,
    changedAt: row?.changed_at ?? null
  };
}

export async function setActiveWinModel(env: Env, id: WinModelId, reason: string): Promise<WinModelState> {
  const current = await winModelState(env);
  await env.DB.prepare(`
    INSERT INTO win_model_state (id, active_model, previous_model, reason, changed_at) VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET active_model = excluded.active_model, previous_model = excluded.previous_model,
      reason = excluded.reason, changed_at = excluded.changed_at
  `).bind(id, current.active, reason.slice(0, 500), isoNow()).run();
  return winModelState(env);
}
