import {
  describe,
  expect,
  it
} from "vitest";

import {
  extractArchiveLinks,
  isAllowedTjkUrl,
  selectLast3,
  videoDate
} from "../src/horses/video-archive";


const BASE =
  "https://www.tjk.org/TR/YarisSever/Query/ConnectedPage/AtKosuBilgileri?1=1&QueryParameter_AtId=103660";


function historyRow(date: string, city: string, kosuKodu: string): string {
  return `
    <tr>
      <td>${date}</td>
      <td>${city}</td>
      <td>2000</td>
      <td>
        <a id="videoAnchor" href="/TR/YarisSever/Info/YarisVideoAt/At?AtKodu=103660&amp;KosuKodu=${kosuKodu}">
          <img alt="Video" />
        </a>
      </td>
    </tr>
  `;
}


describe(
  "isAllowedTjkUrl",
  () => {
    it(
      "accepts an https www.tjk.org url",
      () => {
        expect(
          isAllowedTjkUrl(
            "https://www.tjk.org/TR/YarisSever/Info/YarisVideoAt/At?AtKodu=1&KosuKodu=2"
          )
        ).toBe(true);
      }
    );

    it(
      "rejects a different host",
      () => {
        expect(
          isAllowedTjkUrl("https://evil.example/tjk.org")
        ).toBe(false);
      }
    );

    it(
      "rejects non-https and malformed values",
      () => {
        expect(isAllowedTjkUrl("http://www.tjk.org/x")).toBe(false);
        expect(isAllowedTjkUrl("not a url")).toBe(false);
      }
    );
  }
);


describe(
  "extractArchiveLinks",
  () => {
    it(
      "extracts a videoAnchor row's date+city as the label",
      () => {
        const html = `
          <table>
            ${historyRow("07.06.2026", "İzmir", "225451")}
            <tr><td>Alakasız satır</td></tr>
            ${historyRow("30.05.2026", "İzmir", "225302")}
          </table>
        `;

        const links = extractArchiveLinks(html, BASE);
        expect(links).toHaveLength(2);
        expect(links[0]).toEqual({
          label: "07.06.2026 İzmir",
          url: "https://www.tjk.org/TR/YarisSever/Info/YarisVideoAt/At?AtKodu=103660&KosuKodu=225451"
        });
      }
    );

    it(
      "ignores a YarisVideoAt link with no KosuKodu",
      () => {
        const html = `
          <a href="/TR/YarisSever/Info/YarisVideoAt/At?AtKodu=1">no kosu kodu</a>
        `;
        expect(extractArchiveLinks(html, BASE)).toHaveLength(0);
      }
    );

    it(
      "dedupes identical hrefs",
      () => {
        const html = `
          <table>
            ${historyRow("07.06.2026", "İzmir", "225451")}
          </table>
          <table>
            ${historyRow("07.06.2026", "İzmir", "225451")}
          </table>
        `;
        expect(extractArchiveLinks(html, BASE)).toHaveLength(1);
      }
    );
  }
);


describe(
  "videoDate / selectLast3",
  () => {
    it(
      "sorts newest first and caps at 3",
      () => {
        const links = [
          { label: "01.01.2026 X", url: "u1" },
          { label: "15.06.2026 X", url: "u2" },
          { label: "10.03.2026 X", url: "u3" },
          { label: "20.12.2025 X", url: "u4" }
        ];

        const result = selectLast3(links);
        expect(result).toHaveLength(3);
        expect(result[0].url).toBe("u2");
        expect(result[1].url).toBe("u3");
        expect(result[2].url).toBe("u1");
      }
    );

    it(
      "drops Koşmaz (did-not-run) entries",
      () => {
        const links = [
          { label: "01.01.2026 X Koşmaz", url: "u1" },
          { label: "15.06.2026 X", url: "u2" }
        ];

        const result = selectLast3(links);
        expect(result).toHaveLength(1);
        expect(result[0].url).toBe("u2");
      }
    );

    it(
      "dedupes by date, not by url",
      () => {
        const links = [
          { label: "01.01.2026 X", url: "u1" },
          { label: "01.01.2026 X", url: "u2" }
        ];

        expect(selectLast3(links)).toHaveLength(1);
      }
    );

    it(
      "gives a label with no parseable date a sort key of 0",
      () => {
        expect(videoDate({ label: "no date here", url: "u" })).toBe(0);
      }
    );
  }
);
