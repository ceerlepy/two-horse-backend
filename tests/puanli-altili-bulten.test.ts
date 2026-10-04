import {
  describe,
  expect,
  it
} from "vitest";

import {
  cleanPuanliHorseName,
  matchPuanliPosts,
  parsePuanliBulten
} from "../src/experts/adapters/puanli-altili-bulten";

import {
  mapRawExpertExtraction
} from "../src/experts/raw-extraction";


/* First race of the live 05.10.2026 Şanlıurfa post (trimmed). */
const POST = `
<div class="hrk">
<table>
<tr class='bas'><td colspan='7'><span class='no'>1. KOŞU</span> &#183; 2 Yaşlı İngilizler &#183; 1200m &#183; Kum &#183; Maiden/Dişi</td></tr>
<tr class='kol'><th class='c'>B.Puan</th><th>At İsmi</th><th class='c'>Yaş</th><th class='c'>Kilo</th><th>Jokey</th><th class='c'>St</th><th class='c'>HK</th></tr>
<tr><td class='puan'>89</td><td class='at'>1 ADDISON DB SKG SK</td><td class='c'>2y d d</td><td class='c'>59</td><td class='jok'>A.ÇANKAYA</td><td class='c'>3</td><td class='c'>24</td></tr>
<tr><td class='puan'>90</td><td class='at'>2 TERKAN GÜZELİ KG K</td><td class='c'>2y d d</td><td class='c'>59</td><td class='jok'>A.H.BAYAR</td><td class='c'>9</td><td class='c'>27</td></tr>
<tr><td class='puan'>88</td><td class='at'>5 GÜLÜMSE KIZIM K</td><td class='c'>2y d d</td><td class='c'>54,5</td><td class='jok'>M.ŞAKİR AP</td><td class='c'>6</td><td class='c'>24</td></tr>
<tr><td class='puan'>87</td><td class='at'>6 HEART SHOT SKG SK</td><td class='c'>2y a d</td><td class='c'>57</td><td class='jok'>İ.AKYAVUZ</td><td class='c'>4</td><td class='c'></td></tr>
</table>
<table>
<tr class='bas'><td colspan='7'><span class='no'>2. KOŞU</span> &#183; 2 Yaşlı İngilizler &#183; 1200m &#183; Kum &#183; Handikap 13 /H3</td></tr>
<tr><td class='puan'>100</td><td class='at'>1 LION OF THE NORTH SKG SK</td><td class='c'>2y d e</td><td class='c'>58,5</td><td class='jok'>F.YARDIMCI</td><td class='c'>1</td><td class='c'>34</td></tr>
<tr><td class='puan'>83</td><td class='at'>4 LOVESICK GRILS SK</td><td class='c'>2y a d</td><td class='c'>58</td><td class='jok'>İ.AKYAVUZ</td><td class='c'>2</td><td class='c'>33</td></tr>
</table>
</div>`;


describe("parsePuanliBulten", () => {
  it("turns each race's score table into favourite + rivals", () => {
    const raw = parsePuanliBulten(POST, "Şanlıurfa");

    expect(raw.races).toHaveLength(2);
    expect(raw.races[0]).toEqual({
      city: "Şanlıurfa",
      raceNumber: 1,
      selections: [
        { horseNumber: 2, horseName: "TERKAN GÜZELİ", comment: "B.Puan 90", labels: ["favorite"] },
        { horseNumber: 1, horseName: "ADDISON", comment: "B.Puan 89", labels: ["rival"] },
        { horseNumber: 5, horseName: "GÜLÜMSE KIZIM", comment: "B.Puan 88", labels: ["rival"] }
      ],
      numberGroups: []
    });
    expect(raw.races[1].selections.map(s => s.horseNumber)).toEqual([1, 4]);
  });

  it("maps into canonical expert picks", () => {
    const picks = mapRawExpertExtraction(parsePuanliBulten(POST, "Şanlıurfa")).picks;
    const fav = picks.find(p => p.raceNumber === 1 && p.horseNumber === 2);
    expect(fav?.isFavorite).toBe(true);
    expect(picks.find(p => p.raceNumber === 1 && p.horseNumber === 1)?.isRival).toBe(true);
  });

  it("strips TJK gear codes from names", () => {
    expect(cleanPuanliHorseName("SEN PINARSIN KG DB SK SGKR")).toBe("SEN PINARSIN");
    expect(cleanPuanliHorseName("BERRYBELLA")).toBe("BERRYBELLA");
    expect(cleanPuanliHorseName("ÜMİTBEY KG KJ%23")).toBe("ÜMİTBEY");
    expect(cleanPuanliHorseName("GOLDEN RACER KG DB SKEKÜRİ A")).toBe("GOLDEN RACER");
    expect(cleanPuanliHorseName("MODERN WARRIOR DBJ%23")).toBe("MODERN WARRIOR");
  });
});


describe("matchPuanliPosts", () => {
  const posts = [
    { title: "Şanlıurfa - 05.10.2026 - Pazartesi - Altılı Bülten", url: "https://puanlialtilibulten.blogspot.com/2026/10/sanlurfa-05102026-pazartesi-altl-bulten.html" },
    { title: "Şanlıurfa - At Yarışı - 05 Ekim 2026 — Accurace Geçmiş Veri Analizi", url: "https://puanlialtilibulten.blogspot.com/2026/10/sanlurfa-at-yars-05-ekim-2026-accurace.html" },
    { title: "Bursa - 05.10.2026 - Pazartesi - Altılı Bülten", url: "https://puanlialtilibulten.blogspot.com/2026/10/bursa-05102026-pazartesi-altl-bulten.html" },
    { title: "Adana - 04.10.2026 - Pazar - Altılı Bülten", url: "https://puanlialtilibulten.blogspot.com/2026/10/adana-04102026-pazar-altl-bulten.html" }
  ];

  it("keeps only that day's scored bulletins for canonical cities", () => {
    expect(matchPuanliPosts(posts, "2026-10-05", ["Bursa", "Şanlıurfa"])).toEqual([
      { city: "Şanlıurfa", url: posts[0].url },
      { city: "Bursa", url: posts[2].url }
    ]);
  });
});
