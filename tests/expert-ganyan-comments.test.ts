import {
  describe,
  expect,
  it
} from "vitest";

import {
  extractGanyanCommentsSection
} from "../src/experts/adapters/browser-session";


describe(
  "Ganyan Canavari comments",
  () => {
    it(
      "accepts actual N. koşuda source identity",
      () => {
        const text = `
Ankara En Son Yorumlar

"kazanmasını bekliyorum"

pascal_1903 tarafından 2. koşuda (4)İZGİOĞLU için yazıldı

"banko bende"

erdem1908 tarafından 1. koşuda (1)HAVACI için yazıldı

Tüm Yorumları Gör

Takı Değişiklikleri
        `;


        const result =
          extractGanyanCommentsSection(
            text,
            "Ankara"
          );


        expect(
          result
        ).not.toBeNull();


        expect(
          result
        ).toContain(
          "2. koşuda (4)İZGİOĞLU"
        );


        expect(
          result
        ).not.toContain(
          "Takı Değişiklikleri"
        );
      }
    );
  }
);
