import constants from "./data/constants.json";
import type { ArchiveMeeting, ArchiveRace, ArchiveRunner } from "./archive-parser";

/*
 * Derived per-starter values stored with the archive:
 *  - pWin: the win-pool (ganyan) probability, final odds normalised
 *    within the race. NULL unless every starter has odds and the race
 *    has exactly one winner (marketOk).
 *  - fig: speed figure. (par - time) / par * 1000, minus the meeting's
 *    track variant for that surface (median of the same quantity over
 *    that meeting's winners, needs >= 2 races with a par). Pars are
 *    median winner times per city/surface/distance/breed from TJK
 *    results Jul 2024 - Oct 2026 (src/value-model/data/constants.json).
 */

const PARS: Record<string, number> = constants.speedPars;

export function parKey(cityId: number, race: ArchiveRace): string {
  return `${cityId}|${race.surface}|${race.distanceMeters}|${race.breed}`;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface DerivedRunner extends ArchiveRunner {
  pWin: number | null;
  fig: number | null;
}

export interface DerivedMeeting {
  races: Array<ArchiveRace & { marketOk: boolean }>;
  runners: DerivedRunner[];
}

export function deriveMeeting(cityId: number, meeting: ArchiveMeeting): DerivedMeeting {
  const byRace = new Map<number, ArchiveRunner[]>();
  for (const r of meeting.runners) {
    const list = byRace.get(r.raceCode) ?? [];
    list.push(r);
    byRace.set(r.raceCode, list);
  }

  const variantSamples = new Map<string, number[]>();
  for (const race of meeting.races) {
    const par = PARS[parKey(cityId, race)];
    const winner = (byRace.get(race.raceCode) ?? []).find(r => r.finishPosition === 1 && r.timeSec != null);
    if (par == null || !winner || race.surface == null) continue;
    const list = variantSamples.get(race.surface) ?? [];
    list.push((par - (winner.timeSec as number)) / par * 1000);
    variantSamples.set(race.surface, list);
  }
  const variants = new Map<string, number>();
  for (const [surface, list] of variantSamples) {
    if (list.length >= 2) variants.set(surface, median(list));
  }

  const races: DerivedMeeting["races"] = [];
  const runners: DerivedRunner[] = [];
  for (const race of meeting.races) {
    const list = byRace.get(race.raceCode) ?? [];
    const inverse = list.map(r => (r.ganyan && r.ganyan > 0 ? 1 / r.ganyan : null));
    const total = inverse.reduce<number>((s, v) => s + (v ?? 0), 0);
    const marketOk =
      list.length > 0 &&
      inverse.every(v => v != null) &&
      total > 0 &&
      list.filter(r => r.finishPosition === 1).length === 1;
    races.push({ ...race, marketOk });

    const par = PARS[parKey(cityId, race)];
    const variant = race.surface != null ? variants.get(race.surface) : undefined;
    list.forEach((r, i) => {
      runners.push({
        ...r,
        pWin: inverse.every(v => v != null) && total > 0 ? (inverse[i] as number) / total : null,
        fig: par != null && variant != null && r.timeSec != null
          ? (par - r.timeSec) / par * 1000 - variant
          : null
      });
    });
  }
  return { races, runners };
}
