import type { Env } from "../env";
import type { LearnedScoreCoefficients } from "../scoring/learned-score";
import type { RunnerValue } from "../value-model/service";

/*
 * One interface for "the model that prices today's races". The rest of the
 * backend asks for the active strategy and never branches on which one it
 * is; adding or retiring a model is a new entry in registry.ts.
 *
 * A strategy answers two questions:
 *   - scoreCoefficients: the AGF-anchored learned score behind the card's
 *     model score, win probability and the normal coupons;
 *   - loadValues: the "AGF farkı" view per runner (model chance next to the
 *     AGF share, the "hafife aldığı / fazla önemsediği at" label), which the
 *     card's Sürpriz and the sürprizli coupon read.
 */
export type WinModelId = "legacy" | "unified";

export interface ValueView {
  status: string;
  /* key: `${city}|${raceNumber}|${horseNumber}` */
  byRunner: Map<string, RunnerValue>;
}

/* Today's races as the scorer returns them: runners carry modelScore and agf_percent. */
export interface ScoredMeeting {
  city?: string;
  races?: any[];
}

export interface WinModelStrategy {
  readonly id: WinModelId;
  readonly scoreCoefficients: LearnedScoreCoefficients;
  loadValues(env: Env, raceDate: string, meetings: ScoredMeeting[]): Promise<ValueView>;
}

export function runnerValueKey(city: string, raceNumber: number, horseNumber: number): string {
  return `${city}|${raceNumber}|${horseNumber}`;
}
