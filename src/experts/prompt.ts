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


ANA SEÇİM ZORUNLU KURALI

Bir gerçek yarış analiz paragrafında ana konu yapılan at MUTLAKA selections[] içinde bulunmalıdır.

Örnek yapı:

"... 9.Koşu ...; (1) AT ADI ... olumlu değerlendirme ... Sırasıyla rakip gördüğümüz isimler: 9-4-5"

Burada:

(1) AT ADI = ANA SEÇİM

9-4-5 = RAKİPLER

Rakip listesini gördüğün halde ana atı atlama.

Bir race object'i gerçek analiz paragrafından üretiyorsan ve paragrafta "(N) AT ADI" biçiminde ana safkan varsa selections=[] OLAMAZ.

Ana safkan için özel "favori" veya "banko" kelimesi bulunması şart değildir.

Aşağıdaki doğal olumlu yorumlar ana selection'dır:

- kazanmaya yakındır
- birincilikle tanışabilir
- önde gelen isimdir
- ilk şansa sahiptir
- ilk şanslı isimdir
- rakiplerini geride bırakabilir
- farklı sonuç elde edebilecek güçtedir
- gerçek gücünü yarışına yansıtabilir
- birinciliğin en güçlü adayıdır
- birinciliğe çok yakındır
- kazanmasını bekliyoruz
- fotoyu önde geçmesini bekliyoruz
- rövanşı alacaktır
- rakiplerinin bir adım önündedir
- ilk atımızdır
- öncelikli şans verdiğimiz isimdir

Pozitif ana yorum var fakat metinde açıkça favorite/banko/star/surprise/avoid sınıfı yoksa:

labels=["strong"]

kullan.


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

Yalnız kaynak açıkça:

favori
en şanslı
en güçlü aday

ve eşdeğer çok güçlü favori dili kullanıyorsa.

Sadece bir paragrafın ana atı olmak otomatik favorite değildir.


banko:

Yalnız kaynak açıkça:

banko
tek

veya tartışmasız biçimde tek önerilen anlamı kullanıyorsa.


strong:

Açık pozitif ana seçim.

Özellikle:

ilk şans
güçlü
birinciliğe yakın
kazanmaya yakın
birincilikle tanışabilir
önde gelen isimdir
rakiplerini geride bırakabilir
farklı sonuç elde edebilecek güçtedir
kazanmasını bekliyoruz
rövanşı alacaktır
ilk atımızdır

gibi ifadeler strong'dur.


star:

Kaynak açıkça yıldız veya özel ana seçim diyorsa.


rival:

Rakip, ikinci şans veya sonraki şans.


surprise:

Sürpriz, bomba veya tatlı kaçak.


avoid:

Açıkça önerilmeyen veya elenen.


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
