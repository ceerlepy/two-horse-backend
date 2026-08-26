import {
  describe,
  expect,
  it
} from "vitest";

import {
  extractGanyanCommentsSection
} from "../src/experts/adapters/ganyan-article";


describe(
  "Ganyan public comments",
  () => {
    it(
      "extracts only the public city comments section",
      () => {
        const text=`
Ankara En Son Tahminler
1,2,3 / 4,5,6
Tüm Tahminleri Gör

Ankara En Son Yorumlar

"kısa seven kısrak sürpriz yapar"
muro 0606 tarafından 1. koşuda (4)HEARTED için yazıldı

"sağlam duyumlar alıyorum"
abc tarafından 2. koşuda (5)ÖRNEK AT için yazıldı

Tüm Yorumları Gör

Takı Değişiklikleri
        `;

        const result =
          extractGanyanCommentsSection(
            text,
            "Ankara"
          );

        expect(result).not.toBeNull();
        expect(result).toContain(
          "1. koşuda (4)HEARTED"
        );
        expect(result).toContain(
          "2. koşuda (5)ÖRNEK AT"
        );
        expect(result).not.toContain(
          "Takı Değişiklikleri"
        );
      }
    );
  }
);
