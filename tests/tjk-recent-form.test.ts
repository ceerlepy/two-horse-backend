import {
  describe,
  expect,
  it
} from "vitest";

import {
  parseTjkMeetingPage
} from "../src/tjk/html-parser";

import {
  parseRecentForm,
  scoreRecentForm
} from "../src/form/recent-form-score";

describe(
  "TJK Son 6 Y integration",
  () => {
    it(
      "extracts Son 6 Y from the same runner row as AGF",
      () => {
        const html = `
          <html>
            <body>
              <h3>1. Koşu 17.00</h3>
              <h3>1200 Kum</h3>

              <table>
                <tr>
                  <th>N</th>
                  <th>At İsmi</th>
                  <th>Sıklet</th>
                  <th>Jokey</th>
                  <th>HP</th>
                  <th>Son 6 Y.</th>
                  <th>AGF</th>
                </tr>

                <tr>
                  <td>1</td>
                  <td>TEST HORSE</td>
                  <td>58</td>
                  <td>TEST JOCKEY</td>
                  <td>70</td>
                  <td>3223-66</td>
                  <td>%25,4</td>
                </tr>
              </table>
            </body>
          </html>
        `;

        const meeting =
          parseTjkMeetingPage(
            html,
            "İstanbul"
          );

        expect(
          meeting.races[0]
            .runners[0]
            .recentFormRaw
        ).toBe(
          "3223-66"
        );

        expect(
          meeting.races[0]
            .runners[0]
            .agfPercent
        ).toBe(
          25.4
        );
      }
    );

    it(
      "reads the rightmost result as the most recent",
      () => {
        const parsed =
          parseRecentForm(
            "4519-71"
          );

        expect(
          parsed.positions[0]
        ).toBe(1);

        expect(
          parsed.positions
        ).toEqual(
          [1, 7, 9, 1, 5, 4]
        );
      }
    );

    it(
      "produces a bounded model score",
      () => {
        const score =
          scoreRecentForm(
            "001311"
          );

        expect(score)
          .not.toBeNull();

        expect(score!)
          .toBeGreaterThanOrEqual(0);

        expect(score!)
          .toBeLessThanOrEqual(100);
      }
    );
  }
);
