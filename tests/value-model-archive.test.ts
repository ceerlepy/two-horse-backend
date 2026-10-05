import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import expected from "./fixtures/tjk-results-adana-2026-09-20.expected.json";
import {
  parseArchiveIndex,
  parseArchiveMeeting,
  raceTimeSeconds,
  trNumber
} from "../src/value-model/archive-parser";
import { deriveMeeting } from "../src/value-model/derive";

/* Full TJK result page for Adana, 20 Sep 2026, as served (gzip). The
 * expected file holds what the offline Python pipeline read from it. */
const html = gunzipSync(
  readFileSync(new URL("./fixtures/tjk-results-adana-2026-09-20.html.gz", import.meta.url))
).toString("utf-8");

describe("TJK result archive parser", () => {
  const meeting = deriveMeeting(1, parseArchiveMeeting(html));

  it("reads every race with its conditions", () => {
    expect(meeting.races.map(r => r.raceCode).sort()).toEqual(Object.keys(expected).map(Number).sort());
    for (const race of meeting.races) {
      const e = (expected as any)[race.raceCode];
      expect(race.raceNumber).toBe(e.raceNumber);
      expect(race.distanceMeters).toBe(e.distance);
      expect(race.surface).toBe(e.surface);
      expect(race.breed).toBe(e.breed);
      expect(race.going).toBe(e.going);
      expect(race.prize1).toBe(e.prize1);
      expect(race.marketOk).toBe(e.marketOk);
    }
  });

  it("reads every starter, its pool probability and speed figure", () => {
    let checked = 0;
    for (const r of meeting.runners) {
      const e = (expected as any)[r.raceCode].runners[String(r.horseId)];
      expect(e, `${r.raceCode}/${r.horseId}`).toBeDefined();
      expect(r.finishPosition).toBe(e.fin);
      expect(r.timeSec).toBe(e.t);
      expect(r.ganyan).toBe(e.gny);
      expect(r.agfPercent).toBe(e.agf);
      expect(r.jockeyId).toBe(e.jockey);
      expect(r.trainerId).toBe(e.trainer);
      expect(r.weight).toBe(e.wt);
      expect(r.hp).toBe(e.hp);
      expect(r.horseNumber).toBe(e.prog);
      if (e.pWin == null) expect(r.pWin).toBeNull(); else expect(r.pWin).toBeCloseTo(e.pWin, 9);
      if (e.fig == null) expect(r.fig).toBeNull(); else expect(r.fig).toBeCloseTo(e.fig, 9);
      checked++;
    }
    const total = Object.values(expected as any).reduce((s: number, race: any) => s + Object.keys(race.runners).length, 0);
    expect(checked).toBe(total);
  });

  it("parses TJK number and time formats", () => {
    expect(trNumber("53,5")).toBe(53.5);
    expect(trNumber("1.234,50")).toBe(1234.5);
    expect(trNumber("57")).toBe(57);
    expect(trNumber("")).toBeNull();
    expect(raceTimeSeconds("1.31.68")).toBeCloseTo(91.68, 9);
    expect(raceTimeSeconds("Derecesiz")).toBeNull();
  });

  it("keeps only domestic meetings from the date index", () => {
    const index = `
      <a href="../Sehir/GunlukYarisSonuclari?SehirId=1&amp;QueryParameter_Tarih=20%2F09%2F2026&amp;SehirAdi=Adana&amp;Era=lastMonth">Adana</a>
      <a href="../Sehir/GunlukYarisSonuclari?SehirId=103&amp;QueryParameter_Tarih=20%2F09%2F2026&amp;SehirAdi=Laurel&amp;Era=lastMonth">Laurel</a>
      <a href="../Sehir/GunlukYarisSonuclari?SehirId=3&amp;QueryParameter_Tarih=20%2F09%2F2026&amp;SehirAdi=%C4%B0stanbul&amp;Era=lastMonth">İstanbul</a>`;
    const links = parseArchiveIndex(index);
    expect(links.map(l => l.cityId)).toEqual([1, 3]);
    expect(links[0].url).toBe(
      "https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisSonuclari?SehirId=1&QueryParameter_Tarih=20%2F09%2F2026&SehirAdi=Adana&Era=lastMonth"
    );
  });
});
