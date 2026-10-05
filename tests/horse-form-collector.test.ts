import { describe, expect, it } from "vitest";

import { parseHorseHistoryPage, raceTimeSeconds } from "../src/form/history-parser";
import { isEmptyHistoryPage } from "../src/form/service";

const PAGE = `
<table id="queryTable" class="tablesorter">
  <thead><tr>
    <th>Tarih</th><th>Şehir</th><th>Msf</th><th>Pist</th><th>S</th><th>Derece</th>
    <th>Sıklet</th><th>Takı</th><th>Jokey</th><th>St</th><th>Gny</th><th>Grup</th>
    <th>K. No-K. Adı</th><th>Kcins</th><th>Ant.</th><th>Sahip</th><th>HP</th>
    <th>Ikramiye</th><th>S20</th>
  </tr></thead>
  <tbody>
    <tr><td>14.09.2026</td><td>Şanlıurfa</td><td>1400</td><td>K:Normal</td><td>4</td><td>1.50.53</td>
      <td>62</td><td>KGSK</td><td>N.ALTIN</td><td>15</td><td>25,05</td><td>4+A</td>
      <td>6</td><td>Handikap 15</td><td>M.A.SUBAY</td><td>X</td><td>51</td><td></td><td>15</td></tr>
    <tr><td>28.09.2026</td><td>Şanlıurfa</td><td>1400</td><td>K:Normal</td><td>1</td><td>1.49.18</td>
      <td>59,5</td><td>KGSK</td><td>R.DOĞAN</td><td>14</td><td>11,6</td><td>4+A</td>
      <td>4</td><td>ŞARTLI 4</td><td>C.SUBAY</td><td>X</td><td>51</td><td>35.000</td><td>14</td></tr>
  </tbody>
</table>`;

describe("horse form collector", () => {
  it("reads time, gate, race number, class, trainer and prize, newest first", () => {
    const rows = parseHorseHistoryPage(PAGE);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      raceDate: "2026-09-28",
      finishPosition: 1,
      finishTime: "1.49.18",
      finishTimeSeconds: 109.18,
      startPosition: 14,
      raceNumber: 4,
      raceClass: "ŞARTLI 4",
      trainer: "C.SUBAY",
      prizeTl: 35000,
      odds: 11.6,
      weight: 59.5
    });
    expect(rows[1].prizeTl).toBeNull();
  });

  it("converts TJK race times to seconds", () => {
    expect(raceTimeSeconds("1.49.18")).toBe(109.18);
    expect(raceTimeSeconds("59.30")).toBe(59.3);
    expect(raceTimeSeconds("")).toBeNull();
    expect(raceTimeSeconds("Koşmadı")).toBeNull();
  });

  it("treats a first-time starter's empty table as a real empty history", () => {
    const html =
      `<table id="queryTable"><tbody><tr><td>Aradığınız kriterlere uygun veri bulunmamaktadır</td></tr></tbody></table>`;

    expect(parseHorseHistoryPage(html)).toEqual([]);
    expect(isEmptyHistoryPage(html)).toBe(true);
    expect(isEmptyHistoryPage("<html>maintenance</html>")).toBe(false);
  });
});
