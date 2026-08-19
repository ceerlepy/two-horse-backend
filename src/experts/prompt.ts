export function expertExtractionPrompt(
  sourceName: string
): string {
  return `
${sourceName} sayfasındaki BUGÜNÜN Türkiye at yarışı tahmin ve yorumlarını çıkar.

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

Yorum varsa kısa fakat anlamını koruyacak şekilde aktar.
`.trim();
}
