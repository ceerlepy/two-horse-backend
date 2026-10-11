import {
  describe,
  expect,
  it
} from "vitest";

import {
  ganyanCommentLabels,
  parseGanyanComments
} from "../src/experts/adapters/ganyan-comments";

import {
  keepNameVerifiedSelections
} from "../src/experts/extractor";


/*
 * Shape of the document the Ganyan Canavarı adapter hands over:
 * the live 12.10.2026 Bursa "En Son Yorumlar" block (trimmed),
 * wrapped in <pre> exactly as wrapDocument does. The live text has
 * no line break between a quote and its identity line.
 */
const BURSA = `<html><body><article><pre>TWOHORSE SOURCE: GANYAN CANAVARI
TWOHORSE TARGET DATE: 2026-10-12
TWOHORSE TARGET CITY: Bursa

Bursa En Son Yorumlar
"11, 4, 2, 3, 5, 8, 1 yazılır."Melihky46 tarafından 8. koşuda (11)EMERY için yazıldı
"bu.koşuda.iki atı ayıramadım sizde ayırmayı .3..1 herkeze bolşanslar"ncdtgnlgr tarafından 8. koşuda (3)GENERAL EL CID için yazıldı
"son yarısinda bu gruptan iyi atlari geçti iyi idman durumuyla yine kazanan olabilir alternatif banko adayı"
Arananadam52 tarafından 4. koşuda (6)GÜLEYCANOĞLU için yazıldı
"Jokey avantajı var gelebilir süpriz"
ali tarafından 5. koşuda (4)LITTLE FLORENTINA için yazıldı
"sana kimse yorum yapmamış"veli tarafından 7. koşuda (4)ALTIN KELEBEK için yazıldı</pre></article></body></html>`;


describe("parseGanyanComments", () => {
  it("keeps only comments that name a role, tied to the site's horse", () => {
    expect(parseGanyanComments(BURSA, "Bursa").races).toEqual([
      {
        city:"Bursa",
        raceNumber:4,
        numberGroups:[],
        selections:[{
          horseNumber:6,
          horseName:"GÜLEYCANOĞLU",
          comment:"son yarısinda bu gruptan iyi atlari geçti iyi idman durumuyla yine kazanan olabilir alternatif banko adayı",
          labels:["banko"]
        }]
      },
      {
        city:"Bursa",
        raceNumber:5,
        numberGroups:[],
        selections:[{
          horseNumber:4,
          horseName:"LITTLE FLORENTINA",
          comment:"Jokey avantajı var gelebilir süpriz",
          labels:["surprise"]
        }]
      }
    ]);
  });

  it("reads role words in any inflection", () => {
    expect(ganyanCommentLabels("Favorimiz bu, sürprizi de var")).toEqual(["favorite","surprise"]);
    expect(ganyanCommentLabels("koşunun en güçlü adayı")).toEqual(["strong"]);
    expect(ganyanCommentLabels("formu iyi gelebilir, rakip 3 4 6")).toEqual([]);
  });

  it("is dropped when the site's horse disagrees with the TJK program", () => {
    const verified = keepNameVerifiedSelections(
      parseGanyanComments(BURSA, "Bursa"),
      [
        { city:"Bursa", raceNumber:4, horseNumber:6, horseName:"GÜLEYCANOĞLU (2)" },
        { city:"Bursa", raceNumber:5, horseNumber:4, horseName:"MUSHU" }
      ]
    );

    expect(verified.raw.races.map(race => race.raceNumber)).toEqual([4]);
    expect(verified.rejected.map(row => row.horseName)).toEqual(["LITTLE FLORENTINA"]);
  });
});
