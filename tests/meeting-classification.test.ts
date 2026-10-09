import { describe, expect, it } from "vitest";

import {
  filterCanonicalTjkMeetings,
  isForeignTjkMeeting
} from "../src/tjk/meeting-classification";

const link = (city: string, id: number) => ({
  city,
  url: `https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=${id}&SehirAdi=${encodeURIComponent(city)}`
});

describe("domestic meetings only", () => {
  /* Tomorrow's card on 9 Oct 2026 carried these next to the Turkish ones. */
  it("drops foreign venues by name or TJK city id", () => {
    const kept = filterCanonicalTjkMeetings([
      link("Ankara", 5),
      link("İzmir", 2),
      link("Diyarbakır", 8),
      link("Karma", 17),
      link("Turffontein Guney Afrika", 60),
      link("Chantilly Fransa", 54),
      link("York Birleşik Krallık", 29),
      link("Santa Anita Park ABD", 32),
      /* An unknown country suffix is still caught by its id. */
      link("Someplace Narnia", 612)
    ]);

    expect(kept.map(item => item.city)).toEqual(["Ankara", "İzmir", "Diyarbakır"]);
  });

  it("keeps every domestic venue", () => {
    for (const city of ["Adana", "İzmir", "İstanbul", "Bursa", "Ankara", "Şanlıurfa", "Elazığ", "Diyarbakır", "Kocaeli"]) {
      expect(isForeignTjkMeeting(city)).toBe(false);
    }
  });
});
