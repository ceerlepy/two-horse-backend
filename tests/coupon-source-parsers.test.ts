import {
  describe,
  expect,
  it
} from "vitest";

import {
  parseHorseturkCoupon
} from "../src/experts/adapters/horseturk-coupon";

import {
  istinyeTitleMatches,
  istinyeWinBets,
  parseIstinyeCoupons
} from "../src/experts/adapters/istinye-coupon";

import {
  mapRawExpertExtraction
} from "../src/experts/raw-extraction";


/* Shape of the live 06.10.2026 HorseTurk Adana article (trimmed). */
const HORSETURK = `
<article><div class="entry-content">
<p>Adana hipodromu 8 koşulu bir at yarışı programı olup 2. Altılı Ganyan 3. Koşu ile saat 15.30 da ekranlara gelecektir.</p>
<h3>HorseTurk 1. Altılı Ganyan Tahmin</h3><p>1.AYAK: 4-3-2-7//1<br />
2.AYAK: 2-6-1//4<br />
3.AYAK: 9-8-6-1//2<br />
4.AYAK: 2-3-4-11//9<br />
5.AYAK: 9 BEST OF ANADOLU<br />
6.AYAK: 1-6-11//3</p>
<h3>HorseTurk 2. Altılı Ganyan Tahmin</h3><p>1.AYAK: 9-8-6-1//2<br />
2.AYAK: 2-3-4-11//9<br />
3.AYAK: 9 BEST OF ANADOLU<br />
4.AYAK: 1-6-11//3<br />
5.AYAK: 5-3-2<br />
6.AYAK: 3 HEVENK banko at</p>
<p>Yedili plase tahmini</p><p>(2)(9)(2)(9)(1)(5)(8)</p>
</div></article>`;

const STARTS = [
  { city:"Adana", sixfoldNumber:1, raceNumber:1 },
  { city:"Adana", sixfoldNumber:2, raceNumber:3 }
];


describe("parseHorseturkCoupon", () => {
  it("keeps only legs the expert wrote with a single horse", () => {
    const raw = parseHorseturkCoupon(HORSETURK, "Adana", STARTS);
    const picks = mapRawExpertExtraction(raw).picks;

    // Multi-horse legs are not picks.
    expect(picks.some(value => value.raceNumber === 1)).toBe(false);
    expect(picks.some(value => value.raceNumber === 7)).toBe(false);

    expect(picks.find(value => value.raceNumber === 5 && value.horseNumber === 9))
      .toMatchObject({ isBanko:true, horseName:"BEST OF ANADOLU" });
    expect(picks.find(value => value.raceNumber === 8 && value.horseNumber === 3))
      .toMatchObject({ isBanko:true, horseName:"HEVENK" });
    expect(picks).toHaveLength(2);
  });

  it("reads a single horse with backups as a favourite and ignores the backups", () => {
    const html = `<article><h3>HorseTurk Altılı Ganyan Tahmin</h3><p>1.AYAK: 6-7//1<br/>2.AYAK: 7//6</p></article>`;
    const picks = mapRawExpertExtraction(parseHorseturkCoupon(html, "Adana", STARTS)).picks;

    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ raceNumber:2, horseNumber:7, isFavorite:true, isBanko:false });
  });

  it("returns nothing when the Altılı start race is unknown", () => {
    expect(parseHorseturkCoupon(HORSETURK, "Kocaeli", STARTS).races).toEqual([]);
  });
});


function istinyePost(title:string, body:string):string {
  return `<article class="elementor-post post"><div class="elementor-post__text">
<h3 class="elementor-post__title"><a href="https://istinyeganyan.com/x/">${title}</a></h3>
${body}</div></article>`;
}

function coupon(lines:string[]):string {
  return lines.map(line => `<p><strong>${line}</strong></p>`).join("\n");
}

/* Shape of the live 06.10.2026 "tahminler" page (trimmed). */
const ISTINYE = `<html><body><div class="elementor-posts-container">
${istinyePost("06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ", `
<p><strong>A TAKIMI</strong></p><p><strong>9.6.1.5.3</strong></p>
<p>SAHANIN İÇİNDEN ALTILI GANYAN TAHMİNİ</p>
<p><strong>1. Koşu</strong><br/>Kum pistte 1 numaralı ABADBEY net bankodur.</p>
${coupon(["1. Altılı Ganyan","1. Koşu: 1","2. Koşu: 1-3-9","5. Koşu: 4-8","2. Altılı Ganyan","5. Koşu: 4-8","7. Koşu: 1"])}
<p>*****</p>
<p>MENAJERİN ALTILI GANYAN TAHMİNİ</p>
${coupon(["1. Altılı Ganyan","1. Koşu: 1-2-3-4-7","2. Koşu: 1-6","5. Koşu: 9","2. Altılı Ganyan","5. Koşu: 9","7. Koşu: 3-5"])}
<p>KURNAZ ABİNİN ALTILI GANYAN TAHMİNİ</p>
${coupon(["1. Altılı Ganyan","1. Koşu: 7","2. Koşu: 1-4-6","5. Koşu: 4-5","2. Altılı Ganyan","5. Koşu: 4-5","7. Koşu: 7"])}
<p>BAHİS OYUNLARI İÇİN TAHMİNLER</p>
<p><strong>1. Koşu</strong><br/><strong>Sabit Ganyan: 4 numaralı KURT BAKIŞLI</strong></p>
`)}
${istinyePost("06 EKİM SALI KOCAELİ ALTILI GANYAN TAHMİNLERİ", `
${coupon(["1. Altılı Ganyan","1. Koşu: 1","2. Koşu: 1, 4, 5","2. Altılı Ganyan","7. Koşu: 2"])}
${coupon(["1. Altılı Ganyan","1. Koşu: 1, 3, 7, 8","2. Koşu: 4","2. Altılı Ganyan","7. Koşu: 1, 2, 4, 7"])}
<p>BAHİS OYUNLARI İÇİN TAHMİNLER</p>
<p>Sabit Bahis (Kazanır / Ganyan Bahsi)</p>
<p>2. Koşu: 1 PUYOL (koşunun mutlak hakimi)</p>
`)}
${istinyePost("BURSA ANALİZİ ALTILI GANYAN TAHMİNİ", coupon(["1. Altılı Ganyan","1. Koşu: 5"]))}
</div></body></html>`;


describe("parseIstinyeCoupons", () => {
  it("matches posts by the date and city in their title", () => {
    expect(istinyeTitleMatches("06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ","2026-10-06","Adana")).toBe(true);
    expect(istinyeTitleMatches("06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ","2026-10-07","Adana")).toBe(false);
    expect(istinyeTitleMatches("06 EKİM SALI KOCAELİ ALTILI GANYAN TAHMİNLERİ","2026-10-06","Kocaeli")).toBe(true);
    expect(istinyeTitleMatches("BURSA ANALİZİ ALTILI GANYAN TAHMİNİ","2026-10-06","Bursa")).toBe(false);
  });

  it("keeps only horses a tipster wrote alone, plus the named win bet", () => {
    const parsed = parseIstinyeCoupons(ISTINYE, "2026-10-06", ["Adana","Kocaeli"]);

    expect(parsed.matchedPosts).toEqual([
      { city:"Adana", title:"06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ", tipsters:3 },
      { city:"Kocaeli", title:"06 EKİM SALI KOCAELİ ALTILI GANYAN TAHMİNLERİ", tipsters:2 }
    ]);

    const picks = mapRawExpertExtraction(parsed.extraction).picks;
    const inRace = (city:string, race:number) =>
      picks.filter(value => value.city === city && value.raceNumber === race);

    // Adana R1: 1 and 7 are each one tipster's tek -> tie, so the named win bet (4) decides.
    expect(inRace("Adana",1)).toEqual([expect.objectContaining({ horseNumber:4, isFavorite:true })]);
    // Adana R2: nobody wrote a tek and there is no win bet -> no pick.
    expect(inRace("Adana",2)).toEqual([]);
    // Adana R5: 9 is the only tek (1 of 3) -> favourite, not banko.
    expect(inRace("Adana",5)).toEqual([expect.objectContaining({ horseNumber:9, isFavorite:true, isBanko:false })]);
    // Kocaeli R2: 4 is a tek for one of the two tipsters -> banko.
    expect(inRace("Kocaeli",2)).toEqual([expect.objectContaining({ horseNumber:4, isBanko:true })]);
    // Exactly one pick per covered race.
    expect(new Set(picks.map(value => `${value.city}${value.raceNumber}`)).size).toBe(picks.length);
    // Nothing from the undated Bursa post.
    expect(picks.some(value => value.city === "Bursa")).toBe(false);
  });

  it("reads the Sabit Bahis list layout", () => {
    expect([...istinyeWinBets("Sabit Bahis (Kazanır / Ganyan Bahsi)\nGünün birincilik için en sağlam adayları:\n1. Koşu: 8 SEVDE RAIDERS (not)\n4. Koşu: 3 KAYALARIN ŞAHI\nİkili\n6. Koşu: 4 KARA BERELİ").entries()])
      .toEqual([[1,8],[4,3]]);
  });

  it("marks a horse written alone by most tipsters as banko", () => {
    const html = istinyePost("06 EKİM SALI ADANA ALTILI GANYAN TAHMİNLERİ", [
      coupon(["1. Altılı Ganyan","5. Koşu: 9"]),
      coupon(["1. Altılı Ganyan","5. Koşu: 9"]),
      coupon(["1. Altılı Ganyan","5. Koşu: 4-9"])
    ].join("\n"));
    const picks = mapRawExpertExtraction(parseIstinyeCoupons(html, "2026-10-06", ["Adana"]).extraction).picks;

    expect(picks.find(value => value.horseNumber === 9)?.isBanko).toBe(true);
  });

  it("finds nothing for a page dated another day", () => {
    const parsed = parseIstinyeCoupons(ISTINYE, "2026-10-07", ["Adana","Kocaeli"]);
    expect(parsed.matchedPosts).toEqual([]);
    expect(parsed.extraction.races).toEqual([]);
  });
});
