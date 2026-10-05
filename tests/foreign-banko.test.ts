import { describe, expect, it } from "vitest";

import { bankoAiPageUrl, bankoSlug, isMissingPage } from "../src/foreign/banko";
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
    expect(bankoAiPageUrl("2026-10-05", "Durbanville Guney Afrika"))
      .toBe("https://www.bankotahminler.com/ai-tahmin/5-ekim-2026-durbanville-guney-afrika/");
  });

  it("recognises missing and challenge pages", () => {
    expect(isMissingPage("<title>Sayfa bulunamadı | Banko</title>")).toBe(true);
    expect(isMissingPage("<title>Just a moment...</title>")).toBe(true);
    expect(isMissingPage("<title>5 Ekim 2026 Deauville Fransa</title>")).toBe(false);
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
