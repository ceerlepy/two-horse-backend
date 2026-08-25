import {
  expertSourceConfig
} from "../config/expert-acquisition";


export interface SixfoldStartInfo {
  city:
    string;

  sixfoldNumber:
    number;

  raceNumber:
    number;
}


function profileRules(
  sourceKey:
    string
): string {
  const profile =
    sourceKey.trim()
      ? expertSourceConfig(
          sourceKey
        )
          .promptProfile
      : "generic";


  switch(profile) {

    case "liderform":
      return `
LIDERFORM ÖZEL KURALI

Gerçek koşu analiz paragrafları SOURCE DATA'dır.

Yazının sonundaki Altılı kupon özeti aynı analizin duplicate
özetidir.

Yalnız bu duplicate kupon özeti ikinci kez horse-level
evidence üretmemelidir.
`.trim();


    case "istinye":
      return `
İSTİNYE GANYAN ÖZEL KURALI

Gerçek expert prose bölümlerini kullan.

Bankomuz, tekimiz, ilk şanslı, rakip, sürpriz ve favori gibi
ifadeler source evidence'dır.

Çıplak sayı/grid tablolarından semantic role veya horse
identity uydurma.
`.trim();


    case "ganyan-canavari":
      return `
GANYAN CANAVARI ÖZEL KURALI

Race + horse identity ile bağlı gerçek yorumları kullan.

"N. koşuda (X) AT ADI için yazıldı" benzeri identity
bağlantıları güvenli evidence'dır.

Açık Banko Gösterilenler veya horse kimliğine bağlı banko,
favori, strong, rival veya surprise yorumunu kullan.

Çıplak kupon kombinasyonlarını bağımsız expert horse pick'e
dönüştürme.
`.trim();


    case "coupon-legs":
      return `
ALTILI / AYAK FORMATLI KAYNAK KURALI

AYAK numarası raceNumber değildir.

Öncelik her zaman CANONICAL TJK ALTILI BAŞLANGIÇ
HARİTASIDIR.

Örneğin canonical data:

2. ALTILI -> 4. KOŞUDA BAŞLAR

ise:

1.AYAK = 4.KOŞU
2.AYAK = 5.KOŞU
3.AYAK = 6.KOŞU

Kaynak ayrıca açık biçimde:

"2. Altılı 4. Koşuda başlar"

diyorsa bu ifade canonical mapping ile tutarlı olduğu zaman
named/semantic selection için ek context olarak kullanılabilir.

Örnek:

4.AYAK:
2 GÖREME BEYİ BANKO

canonical başlangıç R3 ise:

4.AYAK -> R6
horseNumber=2
labels=["banko"]

ÇIPLAK KUPON üyeliğine semantic label UYDURMA.

Örneğin:

1.AYAK: 1-5-11-8
2.AYAK: 3-4-5

tek başına:

favorite
strong
rival
surprise

anlamına gelmez.

Ancak açık:

BANKO
TEK
FAVORİ
FAVORİM
İLK ŞANS
RAKİP
SÜRPRİZ

gibi semantic ifade varsa selection üret.

Aynı named selection birden fazla kupon özetinde duplicate
geçiyorsa aynı official race + horse identity için tek evidence
üret.
`.trim();


    case "generic":
      return `
GENEL ALTILI GANYAN / TAHMİN KURALI

Bir article'ın başlığında ALTILI, TAHMİN veya BÜLTEN yazması
içeriği IGNORE etme sebebi DEĞİLDİR.

Altılı/Ayak bölümleri gerçek source prediction data
taşıyabilir.

BANKO, TEK, FAVORİ, FAVORİM, İLK ŞANS, RAKİP, SÜRPRİZ ve
diğer açık expert ifadelerini koru.

AYAK numarasını kendi başına resmi raceNumber sanma.
`.trim();
  }
}


function sixfoldRules(
  values:
    SixfoldStartInfo[]
): string {
  if (!values.length) {
    return `
CANONICAL TJK ALTILI BAŞLANGIÇ HARİTASI YOK.

Çıplak N.AYAK bilgisinden resmi raceNumber tahmin etme.

Yalnız açık N.KOŞU identity varsa kullan.
`.trim();
  }


  return `
CANONICAL TJK ALTILI BAŞLANGIÇ HARİTASI

${
  values
    .map(
      value =>
        `${value.city}: ${value.sixfoldNumber}. ALTILI -> ${value.raceNumber}. KOŞUDA BAŞLAR`
    )
    .join("\n")
}

AYAK mapping yalnız bu canonical haritadan yapılır.

raceNumber =
canonicalStartRace + ayakNumber - 1

Şehir veya hangi Altılı olduğu güvenli değilse mapping
uydurma.
`.trim();
}


export function expertExtractionPrompt(
  sourceName:
    string,

  raceDate =
    "BUGÜN",

  cities:
    string[] = [],

  sourceKey =
    "",

  sixfoldStarts:
    SixfoldStartInfo[] = []
): string {
  return `
${sourceName} kaynağındaki Türkiye at yarışı expert
seçimlerini çıkar.

HEDEF TARİH:
${raceDate}

HEDEF TJK ŞEHİRLERİ:
${cities.join(", ")}

Yalnız hedef tarih/şehir source prediction verisini kullan.

${profileRules(sourceKey)}

${sixfoldRules(sixfoldStarts)}

ANA SEÇİM

Gerçek koşu analizinde açıkça pozitif ana konu yapılan horse
selections[] içinde bulunmalıdır.

Özel BANKO veya FAVORİ kelimesi şart değildir.

Açık pozitif ana yorum daha özel label yoksa:

labels=["strong"]

LABELS

Yalnız:

favorite
banko
strong
star
rival
surprise
avoid

favorite:
açık favori/favorim/en şanslı/en güçlü aday.

banko:
açık banko/tek/yalnız bırakılabilir.

strong:
pozitif ana seçim, daha özel label yok.

star:
açık yıldız/özel ana seçim.

rival:
rakip/ikinci şans/sonraki şans.

surprise:
sürpriz/bomba/tatlı kaçak.

avoid:
açık önerilmeyen/elenecek.

OUTPUT

Her gerçek koşu races[] içinde bir kez:

city
raceNumber
selections
numberGroups

SELECTION

horseNumber
horseName
comment
labels

At adı uydurma.

NUMBER GROUP

Örneğin:

Rakipler: 6-1-8

güvenli biçimde aynı resmi koşuya aitse:

label="rival"
horseNumbers=[6,1,8]

Bu yalnız transport grouping'dir.

IDENTITY

city + raceNumber gerçek TJK koşusu olmalı.

horseNumber gerçek program numarası olmalı.

Tarih, AGF, HP, kilo, oran, derece veya AYAK numarasını
horseNumber/raceNumber sanma.

sourceRank üretme.
confidence üretme.

Güvenli current-card expert data varsa races=[] döndürme.

Gerçekten yoksa races=[] döndür.

Yalnız JSON schema'ya uygun data üret.
`.trim();
}
