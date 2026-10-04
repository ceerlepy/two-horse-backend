import {
  describe,
  expect,
  it
} from "vitest";

import {
  countryOfForeignMeeting,
  discoverForeignMeetingLinks
} from "../src/foreign/discovery";

import {
  discoverDomesticMeetingLinks
} from "../src/tjk/html-parser";


const BASE =
  "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";

/* Anchors as TJK's programme page printed them on 2026-10-04. */
const MASTER = `
  <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=3&amp;QueryParameter_Tarih=04%2F10%2F2026&amp;SehirAdi=%C4%B0stanbul&amp;Era=today">İstanbul  (75. Y.G.)</a>
  <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=17&amp;QueryParameter_Tarih=04%2F10%2F2026&amp;SehirAdi=Karma&amp;Era=today">Karma </a>
  <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=120&amp;QueryParameter_Tarih=04%2F10%2F2026&amp;SehirAdi=Durbanville%20Guney%20Afrika&amp;Era=today">Durbanville Guney Afrika (YD 2) </a>
  <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=104&amp;QueryParameter_Tarih=04%2F10%2F2026&amp;SehirAdi=Longchamp%20Fransa&amp;Era=today">Longchamp Fransa (YD 3) </a>
  <a href="/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=32&amp;QueryParameter_Tarih=04%2F10%2F2026&amp;SehirAdi=Santa%20Anita%20Park%20ABD&amp;Era=today">Santa Anita Park ABD (YD 7) </a>
`;


describe("discoverForeignMeetingLinks", () => {
  it("picks only the (YD n) meetings, in TJK's order", () => {
    const links = discoverForeignMeetingLinks(MASTER, BASE);

    expect(links.map(l => [l.city, l.country, l.ydOrder])).toEqual([
      ["Durbanville Guney Afrika", "Güney Afrika", 2],
      ["Longchamp Fransa", "Fransa", 3],
      ["Santa Anita Park ABD", "ABD", 7]
    ]);
    expect(links[1].url).toContain("SehirId=104");
  });

  it("leaves domestic discovery unchanged", () => {
    const domestic = discoverDomesticMeetingLinks(MASTER, BASE).map(l => l.city);
    expect(domestic).toContain("İstanbul");
    expect(domestic).not.toContain("Longchamp Fransa");
  });
});


describe("countryOfForeignMeeting", () => {
  it("recognises UK and Irish venues", () => {
    expect(countryOfForeignMeeting("Newmarket Ingiltere")).toBe("İngiltere");
    expect(countryOfForeignMeeting("Leopardstown Irlanda")).toBe("İrlanda");
    expect(countryOfForeignMeeting("Somewhere")).toBeNull();
  });
});
