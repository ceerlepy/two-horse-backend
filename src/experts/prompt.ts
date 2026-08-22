export function expertExtractionPrompt(
  sourceName: string,
  raceDate = "BUGÜN",
  cities: string[] = []
): string {
  return `
${sourceName} sayfasındaki Türkiye at yarışı tahmin ve yorumlarını çıkar.

HEDEF TARİH: ${raceDate}
HEDEF ŞEHİRLER: ${
  cities.length
    ? cities.join(", ")
    : "BUGÜNÜN RESMİ PROGRAMINDAKİ ŞEHİRLER"
}

Yalnızca HEDEF TARİH ve HEDEF ŞEHİRLER için açıkça görülen tahminleri çıkar.

Başka tarih, başka şehir veya eski bülten görürsen onları ASLA picks içine koyma.

Sayfada hedef karta ait geçerli tahmin yoksa picks boş array olmalı.

Yalnızca sayfada açıkça görülen bilgiyi kullan.

Etiket eşlemesi:

- "tek", "banko", "risk edilir" açıkça tek öneriyse:
  isBanko=true

- "favori", "en şanslı", "ilk atım":
  isFavorite=true

- "güçlü", "ilk şans", "öncelikli":
  isStrong=true

- yıldız veya özel işaretli ana seçim:
  isStar=true

- "rakip", "ikinci şans", "daha sonra":
  isRival=true

- "sürpriz", "bomba", "tatlı kaçak":
  isSurprise=true

- açıkça olumsuz, önerilmeyen veya elenen:
  isAvoid=true

Aynı at birden fazla etikete sahip olabilir.

Program numarası, AGF, HP, kilo, tarih veya oran değerlerini at numarası sanma.

Şehir, koşu numarası, at numarası ve at adı mutlaka aynı tahmine ait olmalı.

Bir etiket açıkça yoksa false kullan.

Tahmin edilmeyen bilgiyi uydurma.

Yorum varsa yalnızca aynı şehir, aynı koşu ve aynı ata ait sayfada açıkça görülen yorumdan çıkar.

Başka bir atın veya başka bir koşunun yorumunu taşıma.

Yorum görünmüyorsa comment=null kullan.

Tahmin veya yorum uydurma.
`.trim();
}
