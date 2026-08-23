export function expertExtractionPrompt(
  sourceName: string,
  raceDate = "BUGÜN",
  cities: string[] = []
): string {
  return `
${sourceName} sayfasındaki Türkiye at yarışı uzman tahminlerini, analizlerini ve yorumlarını çıkar.

HEDEF TARİH: ${raceDate}
HEDEF ŞEHİRLER: ${
  cities.length
    ? cities.join(", ")
    : "BUGÜNÜN RESMİ PROGRAMINDAKİ ŞEHİRLER"
}

Yalnızca HEDEF TARİH ve HEDEF ŞEHİRLER için açıkça görülen içerikleri çıkar.

Başka tarih, başka şehir, geçmiş yarış veya yurt dışı yarış içeriğini picks içine koyma.

UZMAN SEÇİMİNİ TANIMA:

Bir atın uzman seçimi olması için mutlaka "favori", "banko" veya "tek" kelimesinin yazması gerekmez.

Aşağıdaki gibi açık pozitif yarış analizi ifadeleri de gerçek uzman seçimidir:

- "birinciliğin en güçlü adayıdır"
- "birinciliğe çok yakındır"
- "kazanmasını beklediğimiz isimdir"
- "kazanmasını bekliyoruz"
- "kazanmaya yakındır"
- "fotoyu önde geçmesini bekliyoruz"
- "rövanşı alacaktır"
- "ilk şansa sahiptir"
- "ilk şanslı isimdir"
- "birinci atımızdır"
- "öncelikli şans verdiğimiz isimdir"

Bu tür açık ana seçimleri ASLA atlama.

ETİKETLER:

- "tek", "banko", "risk edilir" veya açıkça tek önerilen isim:
  isBanko=true

- "favori", "en şanslı", "en güçlü aday":
  isFavorite=true

- "güçlü", "ilk şans", "öncelikli",
  "birinciliğe çok yakın",
  "kazanmasını beklediğimiz",
  "kazanmasını bekliyoruz",
  "rövanşı alacaktır":
  isStrong=true

- yıldız veya açık özel ana seçim:
  isStar=true

- "rakip", "rakip gördüğümüz", "ikinci şans",
  "daha sonra", "rakip önereceğimiz":
  isRival=true

- "sürpriz", "bomba", "tatlı kaçak":
  isSurprise=true

- açıkça olumsuz, önerilmeyen veya elenen:
  isAvoid=true

RAKİP NUMARALARI:

Örneğin aynı koşunun analizinde:

"Sırasıyla rakip gördüğümüz isimler: 2-3-6"

yazıyorsa 2, 3 ve 6 numaralı atların HER BİRİ ayrı pick olmalıdır.

Her biri için:

isRival=true

olmalıdır.

Kaynak bu rakiplerin at adını açıkça yazmıyorsa tahmini atma ve isim uydurma.

Bu durumda:

horseNumber = kaynakta açıkça görünen at numarası
horseName = null

Canonical at adı daha sonra resmi TJK programından tamamlanacaktır.

ANA AT ÖRNEĞİ:

"(1) PRANDELLO ... birinciliğin en güçlü adayıdır"

şeklindeyse:

horseNumber=1
horseName="PRANDELLO"

ve cümlenin açık anlamına göre ilgili pozitif etiketleri true yap.

Şehir ve koşu numarasını paragrafın açık bağlamından al.

Program numarası, tarih, AGF, HP, kilo, mesafe,
oran veya derece değerlerini horseNumber sanma.

city + raceNumber + horseNumber aynı gerçek tahmine ait olmalıdır.

horseName kaynakta açıkça görünüyorsa aynı ata ait olmalıdır.

horseName görünmüyorsa null kullan.

At adı uydurma.

Aynı at birden fazla etikete sahip olabilir.

Bir etiket açıkça yoksa false kullan.

Yorum varsa yalnızca aynı şehir, aynı koşu ve aynı ata ait açık yorumdan çıkar.

Ana atın uzun analiz yorumunu rakip numaralarına kopyalama.

Rakip için ayrı yorum görünmüyorsa:

comment=null

kullan.

sourceRank yalnızca kaynak açık bir sıralama veriyorsa kullan.
Aksi halde null kullan.

Tahmin, at adı veya yorum uydurma.

Sayfada gerçekten HEDEF TARİH ve HEDEF ŞEHİRLER için hiçbir uzman seçimi yoksa ancak o zaman:

picks=[]

döndür.
`.trim();
}
