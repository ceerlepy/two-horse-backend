export function expertExtractionPrompt(
  sourceName:
    string,

  raceDate =
    "BUGÜN",

  cities:
    string[] = []
): string {
  return `
${sourceName} kaynağındaki bugünkü Türkiye at yarışı uzman seçimlerini çıkar.

HEDEF TARİH:
${raceDate}

HEDEF TJK ŞEHİRLERİ:
${
  cities.length
    ? cities.join(", ")
    : "bugünkü resmi TJK şehirleri"
}

Yalnız HEDEF KARTA ait gerçek expert yarış analizlerini kullan.

Başka güne veya yabancı yarışa açıkça ait içeriği çıkarma.

OUTPUT YAPISI

Aynı city + raceNumber için city ve raceNumber değerlerini her atta tekrar etme.

Her gerçek koşuyu races[] içinde yalnız bir kez üret.

Her race:

city
raceNumber
selections
numberGroups

SELECTIONS

Kaynak bir atı adıyla veya açık ayrı yorumuyla analiz ediyorsa selections içine koy.

Her selection:

horseNumber
horseName
comment
labels

horseName veya comment kaynakta yoksa alanı tamamen OMIT edebilirsin.

At adı uydurma.

comment yalnız aynı ata ait kısa kaynak ifadesi olsun.

Uzun paragrafı kopyalama.

LABELS

Yalnız:

favorite
banko
strong
star
rival
surprise
avoid

kullan.

favorite:
favori, en şanslı veya en güçlü aday.

banko:
banko, tek veya açık biçimde tek önerilen.

strong:
ilk şans, güçlü, birinciliğe yakın, kazanmaya yakın,
kazanmasını bekliyoruz, rövanşı alacaktır, ilk atımızdır
veya açık ana pozitif expert seçimidir.

star:
kaynak açıkça yıldız veya özel ana seçim diyorsa.

rival:
rakip, ikinci şans veya sonraki şans.

surprise:
sürpriz, bomba veya tatlı kaçak.

avoid:
açıkça önerilmeyen veya elenen.

Bir selection birden fazla label alabilir.

NUMBER GROUPS

Kaynak aynı koşuda yalnız numara listesi veriyorsa bunu compact numberGroups olarak çıkar.

Örnek:

Sırasıyla rakip gördüğümüz isimler: 6-1-8

şu anlama gelir:

label = rival
horseNumbers = [6,1,8]

Bu birleştirme yalnız OUTPUT TRANSPORT optimizasyonudur.

6, 1 ve 8 uygulamada ayrı ayrı at seçimlerine dönüştürülecektir.

Benzer açık numara listelerinde appropriate label kullan:

favorite
banko
strong
star
rival
surprise
avoid

Numara listesinde at adı yazmıyorsa isim uydurma.

KUPON / ALTILI BLOKLARI TAMAMEN IGNORE ET

ALTILI GANYAN TAHMİNİMİZ
BİRİNCİ ALTILI GANYAN
İKİNCİ ALTILI GANYAN

1.Ayak:
2.Ayak:
3.Ayak:
4.Ayak:
5.Ayak:
6.Ayak:

satırları expert runner extraction değildir.

Örnek:

1.Ayak: 5.6.1.4

buradaki:

1 = raceNumber değildir.

5,6,1,4 = otomatik expert seçimleri değildir.

IDENTITY

city + raceNumber aynı gerçek koşu analizine ait olmalıdır.

horseNumber gerçek program numarası olmalıdır.

Program numarası dışındaki tarih, AGF, HP, kilo, mesafe,
oran, derece ve kupon sayılarını horseNumber sanma.

sourceRank üretme.

confidence üretme.

Sayfada hedef karta ait açık expert analizleri varsa races=[] döndürme.

Gerçekten current-card expert seçimi yoksa ancak o zaman races=[] döndür.

Yalnız response_format JSON schema'sına uygun veri üret.
`.trim();
}
