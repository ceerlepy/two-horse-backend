import {
  describe,
  expect,
  it
} from "vitest";

import {
  assertCompleteMeeting,
  discoverDomesticMeetingLinks,
  parseTjkMeetingPage
} from "../src/tjk/html-parser";

describe("TJK meeting discovery", () => {
  it("preserves TJK city-detail href including SehirId", () => {
    const html = `
      <html>
        <body>
          <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?Era=today&SehirAdi=%C4%B0stanbul&SehirId=3">
            İstanbul (40. Y.G.)
          </a>

          <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?Era=today&SehirAdi=Ascot">
            Ascot (YD)
          </a>
        </body>
      </html>
    `;

    const links = discoverDomesticMeetingLinks(
      html,
      "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami"
    );

    expect(links).toHaveLength(1);

    expect(links[0].city).toBe("İstanbul");
    expect(links[0].url).toContain(
      "/Info/Sehir/GunlukYarisProgrami"
    );
    expect(links[0].url).toContain("SehirId=3");
  });
});

describe("TJK city parser", () => {
  /*
   * This fixture intentionally models the TJK structure that
   * caused the production regression:
   *
   * - navigation race headings appear first
   * - detailed race headings appear again later
   * - surface metadata is stored in separate h3 nodes
   */
  const html = `
    <html>
      <body>

        <!-- navigation -->
        <h3>1. Koşu 17.00</h3>
        <h3>2. Koşu 17.30</h3>

        <!-- detailed race 1 -->
        <h3>1. Koşu 17.00</h3>
        <h3>ŞARTLI 4 / 1200 Kum / 3 Yaşlı İngilizler</h3>

        <table>
          <tr>
            <th>No</th>
            <th>At İsmi</th>
            <th>Sıklet</th>
            <th>Jokey</th>
            <th>HP</th>
            <th>AGF</th>
          </tr>
          <tr>
            <td>1</td>
            <td><a>ALFA</a></td>
            <td>58</td>
            <td><a>JOKEY A</a></td>
            <td>75</td>
            <td>%30,5</td>
          </tr>
          <tr>
            <td>2</td>
            <td><a>BRAVO</a></td>
            <td>57.5</td>
            <td><a>JOKEY B</a></td>
            <td>68</td>
            <td>%20</td>
          </tr>
        </table>

        <!-- detailed race 2 -->
        <h3>2. Koşu 17.30</h3>
        <h3>HANDİKAP 15 / 1600 Çim / 4 Yaşlı Araplar</h3>

        <table>
          <tr>
            <th>No</th>
            <th>At İsmi</th>
            <th>Sıklet</th>
            <th>Jokey</th>
            <th>HP</th>
            <th>AGF</th>
          </tr>
          <tr>
            <td>3</td>
            <td><a>CHARLIE</a></td>
            <td>60</td>
            <td><a>JOKEY C</a></td>
            <td>80</td>
            <td>45%</td>
          </tr>
        </table>

      </body>
    </html>
  `;

  it("pairs duplicate navigation/detail headings correctly", () => {
    const meeting =
      parseTjkMeetingPage(
        html,
        "İstanbul"
      );

    expect(meeting.races).toHaveLength(2);

    expect(meeting.races[0]).toMatchObject({
      raceNumber: 1,
      time: "17:00",
      distanceMeters: 1200,
      track: "Kum"
    });

    expect(meeting.races[1]).toMatchObject({
      raceNumber: 2,
      time: "17:30",
      distanceMeters: 1600,
      track: "Çim"
    });
  });

  it("keeps runner number/name pairs intact", () => {
    const meeting =
      parseTjkMeetingPage(
        html,
        "İstanbul"
      );

    expect(
      meeting.races[0].runners
        .map(runner => [
          runner.number,
          runner.name
        ])
    ).toEqual([
      [1, "ALFA"],
      [2, "BRAVO"]
    ]);

    expect(
      meeting.races[1].runners
        .map(runner => [
          runner.number,
          runner.name
        ])
    ).toEqual([
      [3, "CHARLIE"]
    ]);
  });

  it("parses HP, weight and AGF", () => {
    const meeting =
      parseTjkMeetingPage(
        html,
        "İstanbul"
      );

    expect(
      meeting.races[0].runners[0]
    ).toMatchObject({
      number: 1,
      weight: 58,
      hp: 75,
      agfPercent: 30.5
    });

    expect(
      meeting.races[1].runners[0]
    ).toMatchObject({
      number: 3,
      weight: 60,
      hp: 80,
      agfPercent: 45
    });
  });

  it("passes Phase-1 completeness invariants", () => {
    const meeting =
      parseTjkMeetingPage(
        html,
        "İstanbul"
      );

    expect(
      () => assertCompleteMeeting(meeting)
    ).not.toThrow();
  });

  it("rejects a race whose distance or track disappeared", () => {
    const meeting =
      parseTjkMeetingPage(
        html,
        "İstanbul"
      );

    meeting.races[0].distanceMeters = null;
    meeting.races[0].track = null;

    expect(
      () => assertCompleteMeeting(meeting)
    ).toThrow(/TJK_DISTANCE_MISSING|TJK_TRACK_MISSING/);
  });

  it("rejects malformed HTML with no races", () => {
    const meeting =
      parseTjkMeetingPage(
        "<html><body>broken page</body></html>",
        "İstanbul"
      );

    expect(
      () => assertCompleteMeeting(meeting)
    ).toThrow("TJK_NO_RACES");
  });
});
