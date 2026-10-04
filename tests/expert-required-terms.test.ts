import {
  describe,
  expect,
  it
} from "vitest";

import {
  hasRequiredTerms
} from "../src/experts/adapters/verified-article";


const TERMS = [
  "tahmin",
  "banko",
  "altılı",
  "analiz"
];


describe(
  "verified-article required terms",
  () => {
    it(
      "rejects a same-day news story (live 2026-10-04)",
      () => {
        expect(
          hasRequiredTerms(
            TERMS,
            "2026-2027 Sonbahar Kış Dönemi İçin Ahır Tahsisleri Başlıyor",
            "https://www.yarisdergisi.com/2026-2027-sonbahar-kis-donemi-icin-ahir-tahsisleri-basliyor/"
          )
        ).toBe(false);
      }
    );

    it(
      "accepts a real prediction article",
      () => {
        expect(
          hasRequiredTerms(
            TERMS,
            "",
            "https://www.yarisdergisi.com/royal-prytania-ve-spic-and-span-bankolarim-adana41026-yusuf-can-kaya/"
          )
        ).toBe(true);
      }
    );

    it(
      "ignores the host name",
      () => {
        expect(
          hasRequiredTerms(
            ["yaris"],
            "",
            "https://www.yarisdergisi.com/ahir-tahsisleri/"
          )
        ).toBe(false);
      }
    );
  }
);
