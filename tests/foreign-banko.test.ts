import { describe, expect, it } from "vitest";

import { readFileSync } from "fs";

import {
  bankoAiPageUrl,
  bankoPostSlug,
  bankoSlug,
  classifyPage
} from "../src/foreign/banko";
import { parseBankoPicks, rankedHorses } from "../src/foreign/banko-picks";
import { raceDateOfForeignLink } from "../src/foreign/discovery";
import { parseTjkMeetingPage } from "../src/tjk/html-parser";

describe("foreign meetings: dates, names, banko pages", () => {
  it("takes the card date from the TJK link, not the wall clock", () => {
    expect(
      raceDateOfForeignLink(
        "https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisProgrami?SehirId=531&QueryParameter_Tarih=04%2F10%2F2026&SehirAdi=Selangor%20Malezya"
      )
    ).toBe("2026-10-04");
    expect(raceDateOfForeignLink("https://www.tjk.org/x")).toBeNull();
  });

  it("builds Banko Tahminler AI page URLs like the site's own", () => {
    expect(bankoSlug("Pontefract Birleşik Krallık")).toBe("pontefract-birlesik-krallik");
    expect(bankoAiPageUrl("2026-04-07", "Deauville Fransa"))
      .toBe("https://www.bankotahminler.com/ai-tahmin/7-nisan-2026-deauville-fransa/");
    expect(bankoPostSlug("2026-10-05", "Le Mans Fransa")).toBe("5-ekim-2026-le-mans-fransa");
    expect(bankoAiPageUrl("2026-10-05", "Durbanville Guney Afrika"))
      .toBe("https://www.bankotahminler.com/ai-tahmin/5-ekim-2026-durbanville-guney-afrika/");
  });

  it("tells a challenge from a missing page", () => {
    expect(classifyPage("<title>Just a moment...</title>")).toBe("challenge");
    expect(classifyPage("<title>Sayfa bulunamadı</title>")).toBe("missing");
    expect(classifyPage("<title>5 Ekim 2026 Le Mans Fransa</title>")).toBe("ok");
  });

  it("parses the AI post: coupons by real race number and ranked picks", () => {
    const picks = parseBankoPicks(
      readFileSync(new URL("./fixtures/banko-ai-longchamp.html", import.meta.url), "utf8")
    );

    expect(picks.coupons).toHaveLength(2);
    expect(picks.coupons[0]).toMatchObject({
      altili: 1,
      startTime: "14:31",
      combinations: 960,
      amountTl: 960
    });
    expect(picks.coupons[0].legs[0]).toEqual({ raceNumber: 1, selection: [1, 5, 8, 11] });
    expect(picks.coupons[1].legs.map(leg => leg.raceNumber)).toEqual([4, 5, 6, 7, 8, 9]);

    const race2 = picks.races.find(race => race.raceNumber === 2)!;
    expect(race2.ranked[0]).toEqual({ number: 1, name: "FOLSOM BLUES (IRE)" });
    expect(race2.ranked.map(horse => horse.number)).toEqual([1, 3, 6, 4, 9, 7, 2, 10]);
    expect(race2.ranked[4].name).toBe("MAN'S BEST FRIEND (IRE)");
    expect(race2.selection).toEqual([1, 2, 3, 4, 6, 7, 9, 10]);
  });

  it("reads ranked names with apostrophes and stops at prose", () => {
    expect(
      rankedHorses("3-CRYPTO RIDE algoritmanın öne aldığı isim. 7-KEEP MOVIN' ON, 1-SHORTMAN ve 4-KIDDO LIGHT yazılabilir.")
        .map(horse => `${horse.number}:${horse.name}`)
    ).toEqual(["3:CRYPTO RIDE", "7:KEEP MOVIN' ON", "1:SHORTMAN", "4:KIDDO LIGHT"]);
  });

  it("does not take a gear tooltip as the horse name", () => {
    const html = `
      <h3>1. Koşu 14.31</h3>
      <h3>Şartlı, 3 Yaşlı Dişi, 56 kg, 1600 Çim</h3>
      <table><thead><tr><th>N</th><th>At İsmi</th><th>Jokey</th><th>Sıklet</th><th>AGF</th></tr></thead>
      <tbody>
        <tr><td>2</td><td><span>SO LOVELY</span><sup class="tooltipp"><span>KG</span><a class="tooltiptextt">Kapalı gözlük takılacağını ifade eder.</a></sup></td>
          <td>C KEANE</td><td>56</td><td>%12</td></tr>
        <tr><td>5</td><td><a href="../../Query/ConnectedPage/AtKosuBilgileri_Y?QueryParameter_AtId=-1">DESERT SMOKE (GB)</a><sup class="tooltipp"><span>KG</span><a class="tooltiptextt">Kapalı gözlük takılacağını ifade eder.</a></sup></td>
          <td>X</td><td>57</td><td>%3</td></tr>
      </tbody></table>`;

    const parsed: any = parseTjkMeetingPage(
      html,
      "Longchamp Fransa",
      "https://www.tjk.org/TR/YarisSever/Info/Sehir/GunlukYarisProgrami"
    );
    const races = parsed.races ?? parsed;
    const names = races.flatMap((race: any) => race.runners.map((runner: any) => runner.name));

    expect(names).toEqual(expect.arrayContaining(["SO LOVELY", "DESERT SMOKE (GB)"]));
    expect(names.some((name: string) => /ifade eder/.test(name))).toBe(false);
  });
});
