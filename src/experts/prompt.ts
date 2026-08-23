export function expertExtractionPrompt(
  sourceName: string,
  raceDate = "BUGÜN",
  cities: string[] = []
): string {
  return `
${sourceName} sayfasındaki bugünkü Türkiye at yarışı uzman seçimlerini çıkar.

HEDEF TARİH:
${raceDate}

HEDEF ŞEHİRLER:
${
  cities.length
    ? cities.join(", ")
    : "bugünkü resmi TJK şehirleri"
}

Bu çağrı current-card extraction içindir.

Türkçe tarih gösterimi, başlık yapısı veya URL slug biçimi farklı olabilir.
Yalnız tarih formatı farklı görünüyor diye mevcut açık yarış analizlerini yok sayma.

Açıkça başka güne veya yabancı yarışa ait bölüm varsa çıkarma.

GÖREV

Kaynak metnindeki gerçek yarış analizlerini structured picks'e dönüştür.

Bir seçim yalnız "favori", "banko" veya "tek" kelimesiyle yazılmak zorunda değildir.

Örneğin aşağıdaki doğal yarış dili de ana expert seçimidir:

- birinciliğin en güçlü adayıdır
- birinciliğe çok yakındır
- ilk şansa sahiptir
- ilk şanslı isimdir
- kazanmaya yakındır
- kazanmasını bekliyoruz
- fotoyu önde geçmesini bekliyoruz
- rövanşı alacaktır
- rakiplerinin bir adım önündedir
- ilk atımızdır
- öncelikli şans verdiğimiz isimdir

Bir koşu analiz paragrafında:

"(1) PRANDELLO ... birinciliğin en güçlü adayıdır"

şeklinde ana konu yapılan at bir expert pick'tir.

LABELS

Yalnız şu label değerlerini kullan:

favorite
banko
strong
star
rival
surprise
avoid

favorite:
favori, en şanslı, en güçlü aday.

banko:
banko, tek veya açık biçimde tek önerilen.

strong:
ilk şans, güçlü, birinciliğe yakın, kazanmaya yakın,
kazanmasını bekliyoruz, rövanşı alacaktır veya açık ana
pozitif seçim.

star:
kaynak açıkça yıldız veya özel ana seçim diyorsa.

rival:
rakip, ikinci şans veya daha sonra değerlendirilmesi gereken.

surprise:
sürpriz, bomba veya tatlı kaçak.

avoid:
açıkça önerilmeyen, elenen veya olumsuz görülen.

Bir at birden fazla label alabilir.

RAKİP NUMARALARI

Aynı koşu analizinde:

"Sırasıyla rakip gördüğümüz isimler: 2-3-6"

yazıyorsa:

2
3
6

numaralı atların HER BİRİ ayrı pick'tir.

Her biri için:

labels=["rival"]

kullan.

Kaynak rakiplerin at adını açıkça vermiyorsa:

horseName=null

kullan.

At adı uydurma.

KUPON VE ALTILI BLOKLARI TAMAMEN IGNORE ET

Aşağıdaki bölümler expert-runner extraction kaynağı değildir:

ALTILI GANYAN TAHMİNİMİZ
BİRİNCİ ALTILI GANYAN
İKİNCİ ALTILI GANYAN

ve:

1.Ayak:
2.Ayak:
3.Ayak:
4.Ayak:
5.Ayak:
6.Ayak:

Örneğin:

1.Ayak: 5.6.1.4

bir yarış analiz paragrafı değildir.

Buradaki:

1 = raceNumber değildir.

5,6,1,4 = otomatik expert horse picks değildir.

Yalnız gerçek koşu analiz bağlamını kullan.

IDENTITY

city + raceNumber + horseNumber aynı gerçek analiz bağlamına ait olmalıdır.

horseName kaynakta açıkça görünüyorsa aynı ata ait olmalıdır.

horseName görünmüyorsa null kullan.

comment yalnız aynı ata ait açık kaynak yorumudur.

Ana atın yorumunu numara-only rakiplere kopyalama.

Rakip için ayrı yorum görünmüyorsa:

comment=null

kullan.

Program numarası, tarih, AGF, HP, kilo, mesafe, oran,
derece ve kupon ayağı değerlerini horseNumber sanma.

sourceRank üretme.

confidence üretme.

Sayfada HEDEF KARTA ait açık yarış analizleri bulunuyorsa
picks=[] döndürme.

Gerçekten expert seçimi yoksa ancak o zaman picks=[] döndür.
`.trim();
}
