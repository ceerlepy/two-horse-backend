import {
  describe,
  expect,
  it
} from "vitest";

import {
  parseHorseHistoryPage
} from "../src/form/history-parser";

import {
  calculateForm
} from "../src/form/form-score";

describe(
  "TJK horse history parser",
  () => {
    it(
      "parses Turkish TJK history table",
      () => {
        const html = `
          <table>
            <tr>
              <th>Tarih</th>
              <th>Şehir</th>
              <th>Msf</th>
              <th>Pist</th>
              <th>S</th>
              <th>Sıklet</th>
              <th>Jokey</th>
              <th>Gny</th>
              <th>HP</th>
            </tr>

            <tr>
              <td>04.07.2026</td>
              <td>İzmir</td>
              <td>1400</td>
              <td>K:Normal</td>
              <td>1</td>
              <td>61,5</td>
              <td>S.KAYA</td>
              <td>2,05</td>
              <td>94</td>
            </tr>

            <tr>
              <td>15.06.2026</td>
              <td>Bursa</td>
              <td>2000</td>
              <td>Ç:Normal</td>
              <td>9</td>
              <td>60</td>
              <td>N.AVCİ</td>
              <td>15,1</td>
              <td>91</td>
            </tr>
          </table>
        `;

        const rows =
          parseHorseHistoryPage(
            html
          );

        expect(rows)
          .toHaveLength(2);

        expect(rows[0])
          .toMatchObject({
            raceDate:
              "2026-07-04",

            city:
              "İzmir",

            distanceMeters:
              1400,

            finishPosition:
              1,

            weight:
              61.5,

            jockey:
              "S.KAYA",

            odds:
              2.05,

            hp:
              94
          });
      }
    );
  }
);

describe(
  "form scoring",
  () => {
    it(
      "rewards improving recent finishes",
      () => {
        const improving =
          calculateForm([
            {
              raceDate:
                "2026-07-04",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 1,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            },
            {
              raceDate:
                "2026-06-20",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 2,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            },
            {
              raceDate:
                "2026-06-01",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 6,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            },
            {
              raceDate:
                "2026-05-10",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 8,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            }
          ]);

        const declining =
          calculateForm([
            {
              raceDate:
                "2026-07-04",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 8,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            },
            {
              raceDate:
                "2026-06-20",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 6,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            },
            {
              raceDate:
                "2026-06-01",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 2,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            },
            {
              raceDate:
                "2026-05-10",
              city: null,
              distanceMeters: null,
              track: null,
              finishPosition: 1,
              weight: null,
              jockey: null,
              odds: null,
              hp: null
            }
          ]);

        expect(
          improving.trend
        ).toBe(
          "improving"
        );

        expect(
          improving.score!
        ).toBeGreaterThan(
          declining.score!
        );
      }
    );
  }
);
